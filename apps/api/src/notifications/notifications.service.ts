import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  NotifType,
  NotifArea,
  NotificationItem,
  UnreadCounts,
  MarkAllReadResponse,
} from '@encre-et-plume/shared';
import type { UserRole } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationPreferencesService } from '../preferences/preferences.service';

// ponytail: single source of truth for area grouping; WS/Redis fan-out upgrade path lands in MC-9
const AREA_BY_TYPE: Record<NotifType, NotifArea> = {
  message: 'messages',
  application: 'demandes',
  report: 'signalements',
  invitation: 'autres',
  project_activity: 'autres',
  release: 'autres',
  like: 'autres',
  comment: 'autres',
  system: 'autres', // F-14: system notifications (data export ready, etc.)
  // MC-7: decision notifs stay in 'autres' — the 'demandes' badge is owner-facing "new applicants",
  // a decision must not inflate the applicant's demandes badge.
  application_accepted: 'autres',
  application_rejected: 'autres',
  // MC-8: a connection request is recipient-actionable (Accepter/Refuser) → 'demandes', same as an
  // application. The acceptance notif is informational → 'autres' (must not inflate the actionable badge).
  connection_request: 'demandes',
  connection_accepted: 'autres',
};

/**
 * BE-RT1 seam: the MC-9 messaging gateway implements this and is wired in via setRealtimeNotifier()
 * (MessagingModule.onModuleInit), mirroring SessionGuard.setSessionStore — no NotificationsModule ↔
 * gateway import, so no circular dep. Best-effort: an emit failure never breaks the notification write.
 */
export interface RealtimeNotifier {
  notifyUnreadChanged(recipientId: string): void;
}

type SourceUserRow = { displayName: string; profileSlug: string; avatar: string | null } | null;

type NotifRow = {
  id: string;
  type: string;
  refId: string | null;
  createdAt: Date;
  readAt: Date | null;
  sourceUser: SourceUserRow;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  // BE-RT1: set by MessagingModule.onModuleInit(). Optional — notifications work with no gateway
  // (e.g. the worker process, or before the gateway wires in).
  private realtimeNotifier?: RealtimeNotifier;
  setRealtimeNotifier(notifier: RealtimeNotifier): void {
    this.realtimeNotifier = notifier;
  }

  /**
   * BE-8 seam: other stories (MC-9 messages, MC-7 applications, AD-2 reports) call this to emit
   * notifications. F-15 wires opt-out check: returns null when recipient opted out of in-app
   * for this notification type. Mandatory types (system, report) always create.
   */
  async create(input: {
    recipientId: string;
    type: NotifType;
    refId?: string | null;
    sourceUserId?: string | null;
  }): Promise<NotificationItem | null> {
    // F-15: skip if recipient opted out of in-app for this type
    const allowed = await this.preferences.isInAppAllowed(input.recipientId, input.type);
    if (!allowed) return null;

    const row = await this.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        refId: input.refId ?? null,
        sourceUserId: input.sourceUserId ?? null,
      },
      include: {
        sourceUser: { select: { displayName: true, profileSlug: true, avatar: true } },
      },
    });

    // BE-RT1: realtime nudge so an online recipient refetches unread counts without a reload/refocus.
    // Best-effort — the DB write above already succeeded; a socket-fan-out failure must not surface.
    try {
      this.realtimeNotifier?.notifyUnreadChanged(input.recipientId);
    } catch {
      /* best-effort realtime; never break the notification write */
    }

    return this.toItem(row as NotifRow);
  }

  /** BE-1, BE-7: own rows only, newest first. */
  async list(accountId: string): Promise<NotificationItem[]> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        sourceUser: { select: { displayName: true, profileSlug: true, avatar: true } },
      },
    });
    return rows.map((r) => this.toItem(r as NotifRow));
  }

  /** BE-2, BE-6, BE-7: unread counts per area; signalements only for admin/maintainer. */
  async unreadCounts(accountId: string, role: UserRole): Promise<UnreadCounts> {
    const isMod = role === 'admin' || role === 'maintainer';
    const groups = await this.prisma.notification.groupBy({
      by: ['type'],
      where: {
        recipientId: accountId,
        readAt: null,
        // non-moderators must not see report notifications at all
        ...(isMod ? {} : { type: { not: 'report' as const } }),
      },
      _count: { _all: true },
    });

    let messages = 0, demandes = 0, signalements = 0, total = 0;
    for (const g of groups) {
      const count = g._count._all;
      const area = AREA_BY_TYPE[g.type as NotifType];
      if (area === 'messages') messages += count;
      else if (area === 'demandes') demandes += count;
      else if (area === 'signalements') signalements += count;
      total += count;
    }

    return { total, messages, demandes, signalements };
  }

  /** BE-3, BE-7: mark one notification read; idempotent if already read; 403/404 on wrong owner/missing. */
  async markRead(accountId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: accountId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const existing = await this.prisma.notification.findUnique({
        where: { id },
        select: { recipientId: true },
      });
      if (!existing) throw new NotFoundException();
      if (existing.recipientId !== accountId) throw new ForbiddenException();
      // else: already read → idempotent no-op
    }
  }

  /** BE-4: mark all own unread as read; returns count of affected rows. */
  async markAllRead(accountId: string): Promise<MarkAllReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toItem(row: NotifRow): NotificationItem {
    return {
      id: row.id,
      type: row.type as NotifType,
      area: AREA_BY_TYPE[row.type as NotifType],
      refId: row.refId,
      sourceUser: row.sourceUser
        ? {
            displayName: row.sourceUser.displayName,
            slug: row.sourceUser.profileSlug,
            avatar: row.sourceUser.avatar,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
    };
  }
}
