import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import JSZip from 'jszip';
import type { JobProcessor } from '../job-processor';
import type { DataExportJob } from '@encre-et-plume/shared';
import { DATA_EXPORT_ARCHIVE_TTL_DAYS } from '@encre-et-plume/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../../media/media.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class DataExportProcessor implements JobProcessor<DataExportJob> {
  readonly queue = 'data-export' as const;
  readonly concurrency = 2; // archive generation is CPU/memory-bound

  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  async process(data: DataExportJob, _job: Job): Promise<void> {
    const { accountId, exportId } = data;

    const exportRow = await this.prisma.dataExport.findUnique({
      where: { id: exportId },
      include: { account: true },
    });

    if (!exportRow) {
      this.logger.warn(`DataExport ${exportId} not found — skipping`);
      return;
    }

    const row = exportRow as unknown as Record<string, unknown>;

    // Idempotent: already completed
    if (row['status'] === 'ready') {
      this.logger.debug(`DataExport ${exportId} already ready — idempotent skip`);
      return;
    }

    const account = row['account'] as Record<string, unknown>;

    try {
      // ── Gather (only existing models; future files seam below) ────────────
      const [profile, portfolio, consents, notifications, mediaManifest, supportTickets] = await Promise.all([
        this.prisma.profile.findUnique({ where: { accountId } }),
        this.prisma.portfolioItem.findMany({ where: { profile: { accountId } } }),
        this.prisma.consentRecord.findMany({ where: { accountId } }),
        this.prisma.notification.findMany({ where: { recipientId: accountId }, orderBy: { createdAt: 'desc' } }),
        this.prisma.media.findMany({
          where: { ownerId: accountId },
          select: { id: true, kind: true, contentType: true, size: true, width: true, height: true, visibility: true, createdAt: true },
        }),
        this.prisma.supportTicket.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' } }), // F-21
      ]);

      // account.json — never include passwordHash
      const accountData = {
        id: account['id'],
        displayName: account['displayName'],
        email: account['email'],
        role: account['role'],
        verified: account['verified'],
        profileSlug: account['profileSlug'],
        createdAt: account['createdAt'],
        emailVerifiedAt: account['emailVerifiedAt'],
        preferences: account['preferences'],
        birthdate: account['birthdate'], // DR-10: RGPD PII — included here (portability), never public
        // passwordHash intentionally omitted
      };

      const README = [
        'Encre & Plume — Export de données personnelles',
        'RGPD art. 20 (portabilité) & art. 17 (effacement)',
        '',
        'Ce fichier contient vos données personnelles au format JSON.',
        '',
        'Fichiers inclus :',
        '  account.json      — Informations de compte',
        '  profile.json      — Profil public',
        '  portfolio.json    — Éléments de portfolio',
        '  consents.json     — Historique des consentements',
        '  notifications.json — Notifications reçues',
        '  media-manifest.json — Métadonnées des médias (pas les fichiers bruts)',
        '  support-tickets.json — Messages au support',
        '',
        // seam: future files (works, chapters, comments, reviews, messages, subscriptions,
        // donations, action-log) added as their epics land — no placeholders emitted.
      ].join('\n');

      // ── Build zip ─────────────────────────────────────────────────────────
      const zip = new JSZip();
      zip.file('account.json', JSON.stringify(accountData, null, 2));
      zip.file('profile.json', JSON.stringify(profile, null, 2));
      zip.file('portfolio.json', JSON.stringify(portfolio, null, 2));
      zip.file('consents.json', JSON.stringify(consents, null, 2));
      zip.file('notifications.json', JSON.stringify(notifications, null, 2));
      zip.file('media-manifest.json', JSON.stringify(mediaManifest, null, 2));
      zip.file('support-tickets.json', JSON.stringify(supportTickets, null, 2)); // F-21
      zip.file('README.txt', README);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // ── Store as private Media ────────────────────────────────────────────
      const { mediaId } = await this.media.createPrivateArchive(accountId, buffer, 'export.zip');

      // ── Update DataExport row ─────────────────────────────────────────────
      const now = new Date();
      const expiresAt = new Date(now.getTime() + DATA_EXPORT_ARCHIVE_TTL_DAYS * 24 * 60 * 60 * 1000);
      await this.prisma.dataExport.update({
        where: { id: exportId },
        data: { status: 'ready', mediaId, readyAt: now, expiresAt },
      });

      // ── Notify (F-5) ─────────────────────────────────────────────────────
      await this.notifications.create({ recipientId: accountId, type: 'system' }).catch((err: unknown) =>
        this.logger.warn(`Notification failed for ${accountId}: ${(err as Error).message}`),
      );

      // ── Email (F-16) ─────────────────────────────────────────────────────
      await this.email.send('data_export_ready', account['email'] as string, {
        displayName: account['displayName'] as string,
      }).catch((err: unknown) =>
        this.logger.warn(`Export-ready email failed for ${accountId}: ${(err as Error).message}`),
      );

      this.logger.log(`DataExport ${exportId} for accountId=${accountId} complete`);
    } catch (err: unknown) {
      // Mark failed so the UI can surface the error; BullMQ retries per queue config
      await this.prisma.dataExport.update({
        where: { id: exportId },
        data: { status: 'failed' },
      });
      throw err; // rethrow so WorkerRunner dead-letters on final attempt
    }
  }
}
