import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Job } from 'bullmq';
import * as bcrypt from 'bcryptjs';
import type { JobProcessor } from '../job-processor';
import type { AccountErasureJob } from '@encre-et-plume/shared';
import { ANONYMIZED_DISPLAY_NAME } from '@encre-et-plume/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../../media/media.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AccountErasureProcessor implements JobProcessor<AccountErasureJob> {
  readonly queue = 'account-erasure' as const;
  readonly concurrency = 1; // serialise erasures; one at a time is fine

  private readonly logger = new Logger(AccountErasureProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async process(data: AccountErasureJob, _job: Job): Promise<void> {
    const { accountId } = data;

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });

    // Idempotent: account missing or already tombstoned
    if (!account) {
      this.logger.debug(`AccountErasure: account ${accountId} not found — idempotent skip`);
      return;
    }

    const row = account as unknown as Record<string, unknown>;
    if (row['displayName'] === ANONYMIZED_DISPLAY_NAME) {
      this.logger.debug(`AccountErasure: account ${accountId} already tombstoned — idempotent skip`);
      return;
    }

    // ── Best-effort S3 first (outside transaction) ────────────────────────
    await this.media.deleteAllOwnerMedia(accountId).catch((err: unknown) =>
      this.logger.warn(`S3 cleanup failed for ${accountId}: ${(err as Error).message}`),
    );

    // ── Randomised bcrypt hash for tombstone (frees original credential) ──
    const randomPassword = randomBytes(32).toString('base64url');
    const tombstoneHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);

    // ── ACID transaction: FK-by-FK erasure ───────────────────────────────
    // Order (child → parent, keeping ConsentRecord and tombstoning Account):
    //   DataExport → PortfolioItem → Profile → Notifications → Media rows →
    //   EmailVerificationToken → PasswordResetToken → tombstone Account
    //
    // F-14 FK checklist — every Account relation in schema.prisma is handled:
    // ✓ DataExport (accountId, required) — deleteMany
    // ✓ PortfolioItem (profileId → Profile → accountId) — deleteMany (child of Profile)
    // ✓ Profile (accountId, 1-1) — deleteMany
    // ✓ Notification received (recipientId, required) — deleteMany (purge)
    // ✓ Notification sent (sourceUserId, nullable) — updateMany sourceUserId=null (anonymize)
    // ✓ Media (ownerId, required) — deleteMany (S3 done above)
    // ✓ EmailVerificationToken (accountId) — deleteMany
    // ✓ PasswordResetToken (accountId) — deleteMany
    // ✓ ConsentRecord (accountId) — KEPT (legal proof)
    // ✓ Account — TOMBSTONE (keep row so ConsentRecord FK is valid; free email+slug for re-signup)

    await this.prisma.$transaction(async (tx) => {
      const p = tx as typeof this.prisma;

      // 1. DataExport — drop FK to Media before deleting Media
      await p.dataExport.deleteMany({ where: { accountId } });

      // 2. PortfolioItem — children of Profile
      await p.portfolioItem.deleteMany({ where: { profile: { accountId } } });

      // 3. Profile
      await p.profile.deleteMany({ where: { accountId } });

      // 4. Notifications: delete received (purge), null sent (anonymize)
      await p.notification.deleteMany({ where: { recipientId: accountId } });
      await p.notification.updateMany({
        where: { sourceUserId: accountId },
        data: { sourceUserId: null },
      });

      // 5. Media rows (S3 bytes already deleted above)
      await p.media.deleteMany({ where: { ownerId: accountId } });

      // 6. Tokens
      await p.emailVerificationToken.deleteMany({ where: { accountId } });
      await p.passwordResetToken.deleteMany({ where: { accountId } });

      // 7. Tombstone Account — do NOT hard-delete (keeps ConsentRecord FK valid)
      //    email + profileSlug use per-id placeholders → freed for re-signup (RGPD-consistent)
      await p.account.update({
        where: { id: accountId },
        data: {
          displayName: ANONYMIZED_DISPLAY_NAME,
          email: `deleted+${accountId}@deleted.encre-et-plume.invalid`,
          profileSlug: `deleted-${accountId}`,
          passwordHash: tombstoneHash,
          avatar: null,
          deletedAt: (row['deletedAt'] as Date | null) ?? new Date(),
        },
      });

      // ConsentRecord intentionally untouched — RGPD legal proof
    });

    // ponytail: AD-10 ActionLogService.record('account_erasure_completed') seam
    this.logger.log(`AccountErasure complete for accountId=${accountId}`);
  }
}
