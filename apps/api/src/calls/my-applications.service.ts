import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ApplicationStatus,
  CreatorRole,
  MyApplicationRow,
  MyApplicationsResponse,
  MyApplicationsStatusFilter,
} from '@encre-et-plume/shared';
import { MY_APPLICATIONS_PAGE_SIZE } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { directionOf, resolveCallSampleThumbs, toApplicationSamples } from './calls.service';

export interface MyApplicationsQueryParsed {
  status: MyApplicationsStatusFilter; // 'all' by default (controller supplies)
  page: number; // 1-based, already clamped ≥ 1
}

// Application.findMany with { include: { call: true, assets } } — only the fields MC-6 renders.
interface AppRow {
  id: string;
  callId: string;
  status: ApplicationStatus;
  appliedAs: string | null;
  createdAt: Date;
  call: {
    title: string;
    authorRoles: string[];
    authorName: string;
    authorId: string | null;
    genres: string[];
  };
  assets: { url: string; kind: string; size: number | null; position: number }[];
}

/**
 * MC-6 "Mes candidatures" — the requesting user's own submitted applications, newest-first,
 * paginated, optionally filtered by status. Strictly self-scoped (applicantId from the session,
 * never a client field) and read-only: no writes, no notifications.
 */
@Injectable()
export class MyApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(applicantId: string, query: MyApplicationsQueryParsed): Promise<MyApplicationsResponse> {
    const { status, page } = query;
    const where =
      status === 'all' ? { applicantId } : { applicantId, status };

    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * MY_APPLICATIONS_PAGE_SIZE,
        take: MY_APPLICATIONS_PAGE_SIZE,
        include: { call: true, assets: { orderBy: { position: 'asc' } } },
      }) as unknown as Promise<AppRow[]>,
      this.prisma.application.count({ where }),
    ]);

    // "Toutes · N" chip: unfiltered count. Same as total when no status filter is active.
    const totalAll =
      status === 'all' ? total : await this.prisma.application.count({ where: { applicantId } });

    const thumbs = await this.resolveCallThumbs(rows);
    return {
      items: rows.map((r) => this.mapRow(r, thumbs)),
      page,
      pageSize: MY_APPLICATIONS_PAGE_SIZE,
      total,
      totalAll,
    };
  }

  /**
   * MC-6 withdraw — hard-delete the caller's own PENDING application (frees the unique
   * (callId, applicantId) key so re-apply works and the board's hasApplied/myApplicationId reset).
   * Self-scoped: 404 if the application is unknown OR not the caller's (no existence leak).
   * 409 if already accepted/rejected (decided — can't be withdrawn). Delete + count decrement (floor
   * 0) in one transaction; then notify the call owner (mirror of the apply notification).
   */
  async withdraw(applicantId: string, applicationId: string): Promise<void> {
    const app = (await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, applicantId: true, status: true, callId: true, call: { select: { authorId: true } } },
    })) as { applicantId: string; status: ApplicationStatus; callId: string; call: { authorId: string | null } } | null;

    if (!app || app.applicantId !== applicantId) throw new NotFoundException('Candidature introuvable.');
    if (app.status !== 'pending') {
      throw new ConflictException('Cette candidature a déjà été traitée et ne peut plus être retirée.');
    }

    await this.prisma.$transaction([
      this.prisma.application.delete({ where: { id: applicationId } }),
      // updateMany with the gt:0 guard floors the count at 0 (no negative on drift).
      this.prisma.projectCall.updateMany({
        where: { id: app.callId, applicationCount: { gt: 0 } },
        data: { applicationCount: { decrement: 1 } },
      }),
    ]);

    // F-5: notify the owner a candidate withdrew. Reuse the 'application' type (refId = callId, since
    // the Application row is now gone); a dedicated 'application_withdrawn' type is F-5's upgrade path.
    // Seed calls with authorId null simply skip it.
    if (app.call.authorId) {
      await this.notifications.create({
        recipientId: app.call.authorId,
        type: 'application',
        refId: app.callId,
        sourceUserId: applicantId,
      });
    }
  }

  /** MC-4X: batched call-cover thumbs (first ready call_sample) for every call on the page. */
  private resolveCallThumbs(rows: AppRow[]): Promise<Map<string, string>> {
    return resolveCallSampleThumbs(this.prisma, [...new Set(rows.map((r) => r.callId))]);
  }

  private mapRow(r: AppRow, thumbs: Map<string, string>): MyApplicationRow {
    return {
      id: r.id,
      callId: r.callId,
      callTitle: r.call.title,
      callDirection: directionOf(r.call.authorRoles[0] ?? 'scenariste'),
      callGenres: r.call.genres,
      callSampleUrl: thumbs.get(r.callId) ?? null,
      ownerName: r.call.authorName,
      ownerId: r.call.authorId ?? null,
      status: r.status,
      appliedAs: (r.appliedAs ?? null) as CreatorRole | null,
      samples: toApplicationSamples(r.assets ?? []),
      createdAt: r.createdAt.toISOString(),
    };
  }
}
