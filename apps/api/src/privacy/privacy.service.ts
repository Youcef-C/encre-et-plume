import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type {
  DataExportDto,
  DataExportStatus,
  DeleteAccountResponse,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

const SESSION_EPOCH_TTL_S = 7 * 24 * 3600; // ≥ max JWT lifetime (7d) — mirrors PasswordResetService

function toDto(
  row: {
    id: string;
    status: string;
    requestedAt: Date;
    readyAt: Date | null;
    expiresAt: Date | null;
    mediaId: string | null;
  },
  downloadUrl: string | null = null,
  expiresIn: number | null = null,
): DataExportDto {
  return {
    status: row.status as DataExportStatus,
    requestedAt: row.requestedAt.toISOString(),
    readyAt: row.readyAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadUrl,
    expiresIn,
  };
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /**
   * POST /me/data-export — idempotent: returns existing pending export instead of creating a new one.
   * "1 active export at a time" rule.
   */
  async requestExport(accountId: string): Promise<DataExportDto> {
    // ponytail: seam for AD-10 ActionLogService.record('data_export_requested') when it lands
    const existing = await this.prisma.dataExport.findFirst({
      where: { accountId, status: 'pending' },
    });
    if (existing) {
      return toDto(existing as never);
    }

    const created = await this.prisma.dataExport.create({
      data: { accountId, status: 'pending' },
    });

    const row = created as unknown as { id: string; status: string; requestedAt: Date; readyAt: Date | null; expiresAt: Date | null; mediaId: string | null };
    await this.queue.enqueue(
      'data-export',
      'run',
      { accountId, exportId: row.id },
      { idempotencyKey: `data-export-${row.id}` },
    );

    return toDto(row);
  }

  /** GET /me/data-export — returns current export status; lazy-expires past-TTL ready exports. */
  async getExport(accountId: string): Promise<DataExportDto> {
    const row = await this.prisma.dataExport.findFirst({
      where: { accountId },
      orderBy: { requestedAt: 'desc' },
    });

    if (!row) {
      // ponytail: 'idle' is the API-only status for "no export yet"; not stored in DB
      return { status: 'idle', requestedAt: null, readyAt: null, expiresAt: null, downloadUrl: null, expiresIn: null };
    }

    const r = row as unknown as { id: string; status: string; requestedAt: Date; readyAt: Date | null; expiresAt: Date | null; mediaId: string | null };

    // Lazy-expire: if ready but past expiresAt, purge and return expired
    if (r.status === 'ready' && r.expiresAt !== null && r.expiresAt < new Date()) {
      if (r.mediaId) {
        await this.media.deleteMediaById(r.mediaId).catch((err: unknown) =>
          this.logger.warn(`Failed to delete export media ${r.mediaId ?? ''}: ${(err as Error).message}`),
        );
      }
      await this.prisma.dataExport.update({
        where: { id: r.id },
        data: { status: 'expired', mediaId: null },
      });
      return toDto({ ...r, status: 'expired', mediaId: null });
    }

    // Attach signed URL for ready exports that haven't expired
    if (r.status === 'ready' && r.mediaId) {
      try {
        const signed = await this.media.signedUrl(accountId, r.mediaId);
        return toDto(r, signed.url, signed.expiresIn);
      } catch (err: unknown) {
        this.logger.warn(`signedUrl failed for mediaId=${r.mediaId}: ${(err as Error).message}`);
        return toDto(r);
      }
    }

    return toDto(r);
  }

  /**
   * DELETE /me/account — password re-auth → lock → revoke sessions → enqueue erasure.
   * Idempotent: if account is already tombstoned, returns { deleted: true } without re-enqueuing.
   */
  async deleteAccount(accountId: string, password: string): Promise<DeleteAccountResponse> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException();

    const row = account as unknown as Record<string, unknown>;

    // Idempotent: already deleted
    if (row['deletedAt'] !== null && row['deletedAt'] !== undefined) {
      return { deleted: true };
    }

    // Password re-authentication
    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Mot de passe incorrect',
        error: 'INVALID_PASSWORD',
      });
    }

    // ponytail: MR-6 pending-balance guard — no-op seam until MR-6 lands
    // if (await balances.hasPending(accountId))
    //   throw new ConflictException(PENDING_BALANCE_MSG);

    // Lock: set deletedAt immediately so no new activity occurs
    await this.prisma.account.update({
      where: { id: accountId },
      data: { deletedAt: new Date() },
    });

    // Revoke all sessions by bumping the session epoch (same mechanism as PasswordResetService)
    await this.redis.set(
      `session-epoch-ms:${accountId}`,
      String(Date.now()),
      'EX',
      SESSION_EPOCH_TTL_S,
    );

    // Enqueue idempotent erasure job
    await this.queue.enqueue(
      'account-erasure',
      'run',
      { accountId },
      { idempotencyKey: `account-erasure-${accountId}` },
    );

    // ponytail: AD-10 ActionLogService.record('account_deletion_requested') seam
    return { deleted: true };
  }

  /**
   * Cron sweep: purge expired archives.
   * Correctness does not depend on this — GET lazy-expires on read.
   * ponytail: not wired to a live cron yet; mirroring MediaService.cleanupOrphans pattern.
   */
  async purgeExpiredExports(): Promise<void> {
    const stale = await this.prisma.dataExport.findMany({
      where: { status: 'ready', expiresAt: { lt: new Date() } },
    });

    for (const row of stale) {
      const r = row as unknown as { id: string; mediaId: string | null };
      if (r.mediaId) {
        await this.media.deleteMediaById(r.mediaId).catch(() => {});
      }
      await this.prisma.dataExport.update({
        where: { id: r.id },
        data: { status: 'expired', mediaId: null },
      });
    }
  }

  // ── Called by DataExportProcessor ─────────────────────────────────────────

  /**
   * Exposed for DataExportProcessor to avoid circular dep injection.
   * Processors inject PrivacyService; PrivacyService must not inject processors.
   */
  getMediaService(): MediaService {
    return this.media;
  }

  getNotificationsService(): NotificationsService {
    return this.notifications;
  }

  getEmailService(): EmailService {
    return this.email;
  }

  getPrismaService(): PrismaService {
    return this.prisma;
  }
}
