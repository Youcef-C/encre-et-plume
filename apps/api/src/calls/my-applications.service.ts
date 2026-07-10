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
import { CallsService, directionOf, resolveCallSampleThumbs, toApplicationSamples } from './calls.service';
import type { EditApplicationDto } from './dto/edit-application.dto';

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
  message: string;
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
    private readonly calls: CallsService,
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
   * MC-6 withdraw — hard-delete the caller's own PENDING or ACCEPTED application (frees the unique
   * (callId, applicantId) key so re-apply works and the board's hasApplied/myApplicationId reset).
   * Self-scoped: 404 if the application is unknown OR not the caller's (no existence leak).
   * Amendment (2026-07-10): an ACCEPTED application may be withdrawn too — deleting it frees the
   * derived seat (accepted-by-role is a count, no counter to maintain) and reopens the call; the MC-8
   * connection is deliberately left intact. Only a REJECTED application 409s (nothing to free).
   * Delete + count decrement (floor 0) in one transaction; then notify the call owner.
   */
  async withdraw(applicantId: string, applicationId: string): Promise<void> {
    const app = (await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, applicantId: true, status: true, callId: true, call: { select: { authorId: true } } },
    })) as { applicantId: string; status: ApplicationStatus; callId: string; call: { authorId: string | null } } | null;

    if (!app || app.applicantId !== applicantId) throw new NotFoundException('Candidature introuvable.');
    if (app.status === 'rejected') {
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

    // MC-14: withdrawing an ACCEPTED application frees a derived seat → reopen an auto-closed call.
    // Pending withdrawals free no seat (the row wasn't accepted), so no reopen attempt.
    if (app.status === 'accepted') await this.calls.reopenIfSeatFreed(app.callId);

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

  /**
   * MC-6 amendment #7: the caller's own application detail — message + all samples (position order)
   * + the call reference. Self-scoped (404 unknown OR not the caller's, no existence leak). Feeds the
   * applicant's detail/edit view (the list returns only the first-sample thumbnail).
   */
  async get(applicantId: string, applicationId: string): Promise<MyApplicationRow> {
    const row = (await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { call: true, assets: { orderBy: { position: 'asc' } } },
    })) as (AppRow & { applicantId: string }) | null;

    if (!row || row.applicantId !== applicantId) throw new NotFoundException('Candidature introuvable.');
    const thumbs = await this.resolveCallThumbs([row]);
    // message is detail-only (the list omits it) — spread it onto the shared row mapping.
    return { ...this.mapRow(row, thumbs), message: row.message };
  }

  /**
   * MC-6 amendment #7: edit the caller's own PENDING application — message + samples only (never the
   * call or applicant). Self-scoped (404 if not the caller's); PENDING-only (409 once decided). Samples
   * are validated by the shared apply helper (CallsService.resolveApplicationSamples — no duplicated
   * normalization). The ApplicationAsset set is replaced atomically and Application.sampleUrl is
   * re-denormalized to the new first sample.
   */
  async edit(applicantId: string, applicationId: string, dto: EditApplicationDto): Promise<MyApplicationRow> {
    const app = (await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, applicantId: true, status: true },
    })) as { applicantId: string; status: ApplicationStatus } | null;

    if (!app || app.applicantId !== applicantId) throw new NotFoundException('Candidature introuvable.');
    if (app.status !== 'pending') {
      throw new ConflictException('Cette candidature a déjà été traitée et ne peut plus être modifiée.');
    }

    const samples = await this.calls.resolveApplicationSamples(applicantId, dto.samples);

    await this.prisma.$transaction([
      this.prisma.applicationAsset.deleteMany({ where: { applicationId } }),
      this.prisma.application.update({
        where: { id: applicationId },
        data: {
          message: dto.message ?? '',
          sampleUrl: samples[0].url, // denormalized first-sample thumbnail
          assets: {
            create: samples.map((s, i) => ({
              mediaId: s.mediaId ?? null,
              portfolioItemId: s.portfolioItemId ?? null,
              url: s.url,
              kind: s.kind,
              size: s.size,
              position: i,
            })),
          },
        },
      }),
    ]);

    return this.get(applicantId, applicationId);
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
