import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { PASSWORD_RESET_TOKEN_INVALID, PASSWORD_RESET_TOKEN_EXPIRED } from '@encre-et-plume/shared';
import { REMEMBER_ME_MAX_AGE_S } from './session-epoch.constants';

const TOKEN_TTL_MS = 60 * 60 * 1000;   // 1h
const DEV_STASH_TTL_S = 3600;
const SESSION_EPOCH_TTL_S = REMEMBER_ME_MAX_AGE_S; // M7: >= max JWT lifetime (rememberMe = 30d)
const BCRYPT_ROUNDS = 10;

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Look up account by email; issue a token only if found.
   * Caller always gets void — non-enumeration: no existence signal leaks.
   */
  async requestReset(email: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true, email: true, displayName: true },
    });
    if (!account) return; // ponytail: non-enumeration — silently return
    await this.issueToken(account);
  }

  /** Issue a signed reset token for an already-fetched account. */
  async issueToken(account: { id: string; email: string; displayName: string }): Promise<void> {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { accountId: account.id, tokenHash, expiresAt },
    });

    const webOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    const resetUrl = `${webOrigin}/reinitialiser-mot-de-passe?token=${raw}`;

    // ponytail: positive opt-in only (H1); hermetic e2e seam — mirrors email-verification.service.ts
    if (process.env['ENABLE_DEV_AUTH_SEAMS'] === 'true') {
      await this.redis.set(`dev-password-reset:${account.email}`, raw, 'EX', DEV_STASH_TTL_S);
    }

    // ponytail: best-effort; row persists, user can re-request
    try {
      await this.emailService.send('password_reset', account.email, {
        resetUrl,
        displayName: account.displayName,
      });
    } catch (err: unknown) {
      this.logger.warn(`Password-reset enqueue failed for accountId=${account.id}: ${(err as Error).message}`);
    }
  }

  /** Validate token, update credential, invalidate sessions, notify. */
  async confirm(token: string, newPassword: string): Promise<void> {
    const tokenHash = sha256(token);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { account: { select: { email: true, displayName: true } } },
    });

    if (!row || row.consumedAt !== null) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Lien invalide ou expiré.',
        error: PASSWORD_RESET_TOKEN_INVALID,
      });
    }

    if (row.expiresAt < new Date()) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Lien invalide ou expiré.',
        error: PASSWORD_RESET_TOKEN_EXPIRED,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const p = tx as typeof this.prisma;
      // 1. Consume this token
      await p.passwordResetToken.update({ where: { id: row.id }, data: { consumedAt: now } });
      // 2. Invalidate any other outstanding reset tokens for this account (AC-B4)
      await p.passwordResetToken.updateMany({
        where: { accountId: row.accountId, consumedAt: null },
        data: { consumedAt: now },
      });
      // 3. Update the credential
      await p.account.update({ where: { id: row.accountId }, data: { passwordHash } });
    });

    // Bump session epoch → all pre-existing JWTs are invalidated (AC-B4).
    await this.redis.set(
      `session-epoch-ms:${row.accountId}`,
      String(Date.now()),
      'EX',
      SESSION_EPOCH_TTL_S,
    );

    // ponytail: AD-10 ActionLog emit('password_reset') here when the service lands

    // ponytail: best-effort; credential already updated
    try {
      await this.emailService.send('password_changed', row.account.email, {
        displayName: row.account.displayName,
      });
    } catch (err: unknown) {
      this.logger.warn(`Password-changed enqueue failed for accountId=${row.accountId}: ${(err as Error).message}`);
    }

    this.logger.log(`Password reset confirmed for accountId=${row.accountId}`);
  }
}
