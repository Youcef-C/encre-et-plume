import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ApplicationDto, ReceivedApplicationsResponse, ReceivedCallGroup } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ACCOUNT_REF_SELECT, toApplicationDto } from './calls.service';

// application.findMany({ include }) row for list() — the ApplicationDto source plus the minimal call.
interface ReceivedRow {
  id: string;
  callId: string;
  sampleUrl: string;
  message: string;
  status: string;
  appliedAs: string | null;
  createdAt: Date;
  applicant: { id: string; displayName: string; profileSlug: string; avatar: string | null; profile: { creatorRoles: string[] } | null };
  assets: { url: string; kind: string; size: number | null; position: number }[];
  call: { id: string; title: string; createdAt: Date };
}

/**
 * MC-7 "Mes appels à projets" — the applications received on the requesting user's OWN calls,
 * grouped by call, and the owner-only accept/reject decision. Ownership is always derived from
 * `call.authorId` (never a client role/id claim); decisions notify the applicant (F-5).
 */
@Injectable()
export class ReceivedApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(ownerId: string): Promise<ReceivedApplicationsResponse> {
    // ponytail: unpaginated grouped read, add per-group "load more" if owner volume demands.
    const rows = (await this.prisma.application.findMany({
      where: { call: { authorId: ownerId } },
      orderBy: { createdAt: 'desc' }, // rows arrive newest-first; groups preserve this order
      include: {
        applicant: { select: ACCOUNT_REF_SELECT },
        assets: { orderBy: { position: 'asc' } },
        call: { select: { id: true, title: true, createdAt: true } },
      },
    })) as unknown as ReceivedRow[];

    // Group by call, first-seen order = call createdAt desc (calls are surfaced by their newest applicant
    // first, but we want groups ordered by the call's own recency — sort group heads by call.createdAt).
    const byCall = new Map<string, ReceivedCallGroup & { callCreatedAt: Date }>();
    for (const r of rows) {
      let group = byCall.get(r.callId);
      if (!group) {
        group = { callId: r.callId, callTitle: r.call.title, callCreatedAt: r.call.createdAt, applications: [] };
        byCall.set(r.callId, group);
      }
      group.applications.push(toApplicationDto(r));
    }

    const groups = [...byCall.values()]
      .sort((a, b) => b.callCreatedAt.getTime() - a.callCreatedAt.getTime())
      .map(({ callCreatedAt: _drop, ...g }) => g);

    return { groups };
  }

  async decide(ownerId: string, applicationId: string, status: 'accepted' | 'rejected'): Promise<ApplicationDto> {
    const app = (await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        applicant: { select: ACCOUNT_REF_SELECT },
        assets: { orderBy: { position: 'asc' } },
        call: { select: { authorId: true, title: true } },
      },
    })) as (ReceivedRow & { applicantId: string; call: { authorId: string | null; title: string } }) | null;

    // 404 on unknown OR not-owner — no existence leak (same pattern as MC-6 withdraw).
    if (!app || app.call.authorId !== ownerId) throw new NotFoundException('Candidature introuvable.');
    // Transitions limited to pending → accepted/rejected; a decision is final (no re-open).
    if (app.status !== 'pending') throw new ConflictException('Cette candidature a déjà été traitée.');

    await this.prisma.application.update({ where: { id: applicationId }, data: { status } });

    // MC-8: create the Connection ("Contacts & connexions") here when MC-8 lands.

    // F-5: notify the applicant of the decision (both branches).
    await this.notifications.create({
      recipientId: app.applicantId,
      type: status === 'accepted' ? 'application_accepted' : 'application_rejected',
      refId: applicationId,
      sourceUserId: ownerId,
    });

    return toApplicationDto({ ...app, status });
  }
}
