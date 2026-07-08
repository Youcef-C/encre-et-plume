import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  ApplicationDto,
  ApplicationSample,
  CallCard,
  CallDetail,
  CallDirection,
  CallDocument,
  CallFormat,
  CallPreview,
  CallStatus,
  CallsBoardResponse,
  CallsResponse,
  CreatorRole,
  InvitationUserRef,
  SeatCounts,
} from '@encre-et-plume/shared';
import {
  APPLICATION_MAX_SAMPLES,
  CALL_FORMAT_LABELS,
  CALL_MAX_DOCUMENTS,
  CALL_MAX_SAMPLES,
  CALL_MAX_SEATS_PER_ROLE,
  CALLS_BOARD_PAGE_SIZE,
  CREATOR_ROLES,
  GENRES,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateCallDto } from './dto/create-call.dto';
import type { UpdateCallDto } from './dto/update-call.dto';
import type { ApplyToCallDto } from './dto/apply-to-call.dto';

const CALLS_DEFAULT_LIMIT = 2;
const CALLS_MAX_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// The "X CHERCHE Y" line uses two label sets: the author position ("DESSINATEUR" — no ·RICE),
// the sought position ("DESSINATEUR·RICE"). Verbatim from the story/prototype eyebrows.
const AUTHOR_LABEL: Record<string, string> = { scenariste: 'SCÉNARISTE', dessinateur: 'DESSINATEUR' };
const SOUGHT_LABEL: Record<string, string> = { scenariste: 'SCÉNARISTE', dessinateur: 'DESSINATEUR·RICE' };

// MC-4X req6: the 403 role-gate message lists the sought role(s) in lower-case natural French.
const SOUGHT_LABEL_LC: Record<string, string> = { scenariste: 'un·e scénariste', dessinateur: 'un·e dessinateur·rice' };

const GENRE_FR = new Map(GENRES.map((g) => [g.id, g.fr]));

/** Lenient limit parse for the MC-1 preview path: bad/absent → default 2; clamped to [1, 6] (never errors). */
export function parseCallsLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, CALLS_MAX_LIMIT) : CALLS_DEFAULT_LIMIT;
}

export interface CallsBoardQueryParsed {
  role?: string;
  genre?: string[];
  status?: CallStatus | 'all';
  page?: number;
}

interface CallRow {
  id: string;
  title: string;
  authorRoles: string[];
  seekingRoles: string[];
  seats: SeatCounts;
  projectId: string | null;
  authorId: string | null;
  authorName: string;
  tags: string[];
  description: string;
  genres: string[];
  format: string | null;
  scope: string | null;
  closesAt: Date | null;
  applicationCount: number;
  status: string;
  createdAt: Date;
}

/** Ready media backing a call asset (sample or document), resolved for display. */
interface AssetMedia {
  position: number;
  kind: string; // 'call_sample' | 'call_document'
  variants: { thumb?: string; web?: string; orig?: string } | null;
  size: number | null;
}

// MC-4X req6: role-gate message lists the sought role(s). Single-role case reads identically to the
// pre-req6 wording ("… — ce rôle ne fait pas partie …"); multi-role uses "aucun de ces rôles ne fait …".
function roleGateMessage(seekingRoles: string[]): string {
  const labels = seekingRoles.map((r) => SOUGHT_LABEL_LC[r] ?? r).join(' ou ');
  const tail =
    seekingRoles.length > 1
      ? 'aucun de ces rôles ne fait partie de vos rôles de création.'
      : 'ce rôle ne fait pas partie de vos rôles de création.';
  return `Cet appel recherche ${labels} — ${tail}`;
}

/** direction from the call's stored authorRole — shared with MC-6 "Mes candidatures". */
export function directionOf(authorRole: string): CallDirection {
  return authorRole === 'dessinateur' ? 'illustratorSeeksWriter' : 'writerSeeksIllustrator';
}

/**
 * MC-4X: batched first-sample thumb per call (min-position ready call_sample) — replaces the old
 * sampleMediaId lookup. Exported so MC-6 "Mes candidatures" shares one derivation (directionOf
 * precedent). One projectCallAsset query + one media query for the whole page.
 */
export async function resolveCallSampleThumbs(prisma: PrismaService, callIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (callIds.length === 0) return out;
  const assets = (await prisma.projectCallAsset.findMany({
    where: { callId: { in: callIds } },
    orderBy: { position: 'asc' },
    select: { callId: true, mediaId: true, position: true },
  })) as { callId: string; mediaId: string; position: number }[];
  if (assets.length === 0) return out;
  const media = (await prisma.media.findMany({
    where: { id: { in: [...new Set(assets.map((a) => a.mediaId))] }, status: 'ready', kind: 'call_sample' },
    select: { id: true, variants: true },
  })) as { id: string; variants: { thumb?: string } | null }[];
  const thumbById = new Map(media.map((m) => [m.id, m.variants?.thumb]));
  for (const a of assets) {
    if (out.has(a.callId)) continue; // assets are position-ordered ⇒ first hit is min position
    const thumb = thumbById.get(a.mediaId);
    if (thumb) out.set(a.callId, thumb);
  }
  return out;
}

function derivedStatus(row: Pick<CallRow, 'status' | 'closesAt'>): CallStatus {
  if (row.status === 'closed') return 'closed';
  if (row.closesAt && row.closesAt.getTime() <= Date.now()) return 'closed';
  return 'open';
}

// MC-4X §8: composes the eyebrow from BOTH author roles + sought roles, e.g.
// "SCÉNARISTE & DESSINATEUR CHERCHE DESSINATEUR·RICE & SCÉNARISTE".
function heading(authorRoles: string[], seekingRoles: string[]): string {
  const a = authorRoles.map((r) => AUTHOR_LABEL[r] ?? r.toUpperCase()).join(' & ');
  const s = seekingRoles.map((r) => SOUGHT_LABEL[r] ?? r.toUpperCase()).join(' & ');
  return `${a} CHERCHE ${s}`;
}

/** MC-4X §8: seats remaining = per-role (sought − accepted) floored at 0, summed. */
function remainingSeatsOf(seats: SeatCounts, accepted: SeatCounts): number {
  return (Object.keys(seats) as CreatorRole[]).reduce(
    (sum, r) => sum + Math.max(0, (seats[r] ?? 0) - (accepted[r] ?? 0)),
    0,
  );
}

/**
 * MC-1 preview + MC-4 full "Appels à projets" board. Read (preview + filtered/paginated board),
 * create (owner from session), and owner close-early. A row past its `closesAt` is served as
 * `closed` regardless of the stored column (defense-in-depth against auto-close job lag).
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── MC-1 preview (unchanged): newest open calls, limited ─────────────────────
  async findOpenCalls(limit: number): Promise<CallsResponse> {
    const rows = (await this.prisma.projectCall.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as unknown as CallRow[];
    return { items: rows.map(mapPreview) };
  }

  // ── MC-4 board: role / genre / status filters, paginated ─────────────────────
  async findBoard(query: CallsBoardQueryParsed, viewerId: string): Promise<CallsBoardResponse> {
    const page = query.page && query.page >= 1 ? query.page : 1;
    const pageSize = CALLS_BOARD_PAGE_SIZE;
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.projectCall.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }) as unknown as Promise<CallRow[]>,
      this.prisma.projectCall.count({ where }),
    ]);

    const [assetMedia, appliedIds, viewerRoles, acceptedByRole] = await Promise.all([
      this.loadCallAssetMedia(rows.map((r) => r.id)),
      this.resolveApplied(rows, viewerId),
      this.getViewerRoles(viewerId),
      this.resolveAcceptedByRole(rows.map((r) => r.id)),
    ]);
    return {
      items: rows.map((r) =>
        this.mapCard(r, viewerId, assetMedia, viewerRoles, appliedIds.get(r.id) ?? null, acceptedByRole.get(r.id) ?? {}),
      ),
      page,
      pageSize,
      total,
    };
  }

  /** Viewer's profile creatorRoles (drives viewerHasRole + the apply role gate). No profile ⇒ []. */
  private async getViewerRoles(viewerId: string): Promise<string[]> {
    const profile = (await this.prisma.profile.findUnique({
      where: { accountId: viewerId },
      select: { creatorRoles: true },
    })) as { creatorRoles: string[] } | null;
    return profile?.creatorRoles ?? [];
  }

  /**
   * MC-4X §8: batched accepted-application counts grouped by (callId, appliedAs) — the filled seats
   * per role. One groupBy for the whole page (no N+1). Callers pass `{}` for empty pages.
   */
  private async resolveAcceptedByRole(callIds: string[]): Promise<Map<string, SeatCounts>> {
    const out = new Map<string, SeatCounts>();
    if (callIds.length === 0) return out;
    // Prisma's groupBy overload is strict; cast the call — the shape is asserted on the result.
    const groupBy = this.prisma.application.groupBy as unknown as (args: unknown) => Promise<unknown>;
    const grouped = (await groupBy({
      by: ['callId', 'appliedAs'],
      where: { callId: { in: callIds }, status: 'accepted', appliedAs: { not: null } },
      _count: { _all: true },
    })) as { callId: string; appliedAs: string | null; _count: { _all: number } }[];
    for (const g of grouped) {
      if (!g.appliedAs) continue;
      const m = out.get(g.callId) ?? {};
      m[g.appliedAs as CreatorRole] = g._count._all;
      out.set(g.callId, m);
    }
    return out;
  }

  /**
   * MC-5/MC-6: single lookup of the viewer's applications for this page. Returns callId → the
   * viewer's own Application id — powers "Candidature envoyée" (hasApplied) AND the MC-6 withdraw
   * button (myApplicationId).
   */
  private async resolveApplied(rows: CallRow[], viewerId: string): Promise<Map<string, string>> {
    if (rows.length === 0) return new Map();
    const applied = (await this.prisma.application.findMany({
      where: { applicantId: viewerId, callId: { in: rows.map((r) => r.id) } },
      select: { id: true, callId: true },
    })) as { id: string; callId: string }[];
    return new Map(applied.map((a) => [a.callId, a.id]));
  }

  private buildWhere(query: CallsBoardQueryParsed): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.role) where['seekingRoles'] = { has: query.role }; // MC-4X req6: match calls seeking this role (ANY)
    if (query.genre && query.genre.length > 0) where['genres'] = { hasSome: query.genre };

    const status = query.status ?? 'open';
    const now = new Date();
    if (status === 'open') {
      where['status'] = 'open';
      where['OR'] = [{ closesAt: null }, { closesAt: { gt: now } }];
    } else if (status === 'closed') {
      where['OR'] = [{ status: 'closed' }, { closesAt: { lte: now } }];
    }
    return where;
  }

  // ── MC-4 create: owner = session account (MC-4X: multi-role + multi-sample + PDF + project) ────
  async createCall(viewerId: string, dto: CreateCallDto): Promise<CallCard> {
    // MC-4X: samples (kind call_sample) + documents (kind call_document), validated in ONE query.
    const sampleIds = dedupe(dto.sampleMediaIds);
    const documentIds = dedupe(dto.documentMediaIds);
    if (sampleIds.length > CALL_MAX_SAMPLES) throw new BadRequestException("Ce visuel d'exemple est invalide.");
    if (documentIds.length > CALL_MAX_DOCUMENTS) throw new BadRequestException('Ce document est invalide.');
    const assetRows = await this.validateCallAssets(viewerId, sampleIds, documentIds);

    // MC-4X req6: an optional linked project must be owned by the author (never trust a client id).
    if (dto.projectId) {
      const project = (await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { ownerId: true },
      })) as { ownerId: string } | null;
      if (!project) throw new BadRequestException('Ce projet est introuvable.');
      if (project.ownerId !== viewerId) throw new ForbiddenException('Vous ne pouvez lier que vos propres projets.');
    }

    const [account, viewerRoles] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: viewerId }, select: { displayName: true } }) as Promise<{ displayName: string } | null>,
      this.getViewerRoles(viewerId),
    ]);

    // MC-4X §8: author position is derived from the profile (a creator can be both) — never sent.
    const authorRoles = [...new Set(viewerRoles)].filter((r) => (CREATOR_ROLES as readonly string[]).includes(r));
    if (authorRoles.length === 0) {
      throw new UnprocessableEntityException(
        'Complétez votre profil (rôle de création) avant de publier un appel.',
      );
    }

    // MC-4X §8: seats define which roles are sought (keys with a count) — seekingRoles is derived.
    const seats = normalizeSeats(dto.seats);
    const seekingRoles = (Object.keys(seats) as CreatorRole[]).filter((r) => (seats[r] ?? 0) > 0);

    const tags = composeTags(dto.genres, dto.scope, dto.format);
    const closesAt = new Date(dto.deadline);

    const row = (await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectCall.create({
        data: {
          title: dto.title,
          authorRoles,
          seekingRoles,
          seats: seats as never,
          projectId: dto.projectId ?? null,
          authorId: viewerId,
          authorName: account?.displayName ?? '',
          tags,
          description: dto.description,
          genres: dto.genres,
          format: dto.format ?? null,
          scope: dto.scope ?? null,
          closesAt,
          status: 'open',
        },
      });
      if (assetRows.length > 0) {
        await tx.projectCallAsset.createMany({
          data: assetRows.map((a, i) => ({ callId: created.id, mediaId: a, position: i })),
        });
      }
      return created;
    })) as unknown as CallRow;

    // Auto-close at the deadline (F-8). Derived-status read (buildWhere/mapCard) covers job lag.
    await this.queue.enqueue(
      'calls',
      'close-call',
      { callId: row.id },
      // BullMQ rejects custom job ids containing ':' ("Custom Id cannot contain :") — hyphens only.
      { delayMs: Math.max(0, closesAt.getTime() - Date.now()), idempotencyKey: `close-call-${row.id}` },
    );

    const assetMedia = await this.loadCallAssetMedia([row.id]);
    return this.mapCard(row, viewerId, assetMedia, viewerRoles);
  }

  /**
   * Validate every sample/document media id in ONE findMany (no N+1): each must be owned by the
   * caller, ready, and the right kind. Returns the ordered media-id list (samples first, then
   * documents) for the asset rows. 400 with the existing French messages on any invalid id.
   */
  private async validateCallAssets(viewerId: string, sampleIds: string[], documentIds: string[]): Promise<string[]> {
    const allIds = [...sampleIds, ...documentIds];
    if (allIds.length === 0) return [];
    const media = (await this.prisma.media.findMany({
      where: { id: { in: allIds } },
      select: { id: true, ownerId: true, status: true, kind: true },
    })) as { id: string; ownerId: string; status: string; kind: string }[];
    const byId = new Map(media.map((m) => [m.id, m]));

    const check = (id: string, kind: string, message: string) => {
      const m = byId.get(id);
      if (!m || m.ownerId !== viewerId || m.status !== 'ready' || m.kind !== kind) {
        throw new BadRequestException(message);
      }
    };
    for (const id of sampleIds) check(id, 'call_sample', "Ce visuel d'exemple est invalide.");
    for (const id of documentIds) check(id, 'call_document', 'Ce document est invalide.');
    return allIds;
  }

  // ── MC-4 owner close-early ───────────────────────────────────────────────────
  async closeEarly(viewerId: string, id: string): Promise<CallCard> {
    const row = (await this.prisma.projectCall.findUnique({ where: { id } })) as unknown as CallRow | null;
    if (!row) throw new NotFoundException('Appel introuvable.');
    if (row.authorId !== viewerId) throw new ForbiddenException('Seul l’auteur peut clôturer cet appel.');

    const updated = (await this.prisma.projectCall.update({
      where: { id },
      data: { status: 'closed' },
    })) as unknown as CallRow;

    const [assetMedia, viewerRoles, acceptedByRole] = await Promise.all([
      this.loadCallAssetMedia([updated.id]),
      this.getViewerRoles(viewerId),
      this.resolveAcceptedByRole([updated.id]),
    ]);
    return this.mapCard(updated, viewerId, assetMedia, viewerRoles, null, acceptedByRole.get(updated.id) ?? {});
  }

  // ── MC-7 round 3: owner field edit (PATCH /calls/:id — same route as close-early) ────────────
  /**
   * Owner edit of an OPEN call. `status:'closed'` alone delegates to the untouched `closeEarly`;
   * any other field is a field edit (mutually exclusive with the close branch). Seats can never drop
   * a role below its accepted-application count (a started collaboration); `seekingRoles`/`tags` are
   * re-derived server-side. A deadline change re-arms the auto-close job with a versioned key so a
   * stale delayed job from the old deadline can't win (paired with the processor's `closesAt` guard).
   */
  async updateCall(viewerId: string, id: string, dto: UpdateCallDto): Promise<CallCard> {
    const keys = (Object.keys(dto) as (keyof UpdateCallDto)[]).filter((k) => dto[k] !== undefined);
    if (keys.length === 0) throw new BadRequestException('Aucune modification fournie.');
    if (dto.status === 'closed') {
      if (keys.some((k) => k !== 'status')) {
        throw new BadRequestException('Clôture et modification ne peuvent pas être combinées.');
      }
      return this.closeEarly(viewerId, id); // untouched close behavior
    }

    const row = (await this.prisma.projectCall.findUnique({ where: { id } })) as unknown as CallRow | null;
    if (!row) throw new NotFoundException('Appel introuvable.');
    if (row.authorId !== viewerId) throw new ForbiddenException('Seul l’auteur peut modifier cet appel.');
    if (derivedStatus(row) === 'closed') throw new ConflictException('Cet appel est clôturé.');

    const acceptedByRole = (await this.resolveAcceptedByRole([id])).get(id) ?? {};

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data['title'] = dto.title;
    if (dto.description !== undefined) data['description'] = dto.description;

    if (dto.genres !== undefined) data['genres'] = dto.genres;
    if (dto.format !== undefined) data['format'] = dto.format ?? null;
    if (dto.scope !== undefined) data['scope'] = dto.scope ?? null;
    if (dto.genres !== undefined || dto.format !== undefined || dto.scope !== undefined) {
      const genres = dto.genres ?? row.genres;
      const scope = dto.scope !== undefined ? dto.scope : row.scope ?? undefined;
      const format = (dto.format !== undefined ? dto.format : (row.format as CallFormat | null)) ?? undefined;
      data['tags'] = composeTags(genres, scope, format);
    }

    if (dto.seats !== undefined) {
      const seats = normalizeSeats(dto.seats);
      // Conservative floor: an accepted applicant is a started collaboration — never orphan them.
      for (const r of Object.keys(acceptedByRole) as CreatorRole[]) {
        const accepted = acceptedByRole[r] ?? 0;
        if (accepted > 0 && (seats[r] ?? 0) < accepted) {
          throw new ConflictException('Impossible de réduire les postes sous le nombre de candidatures acceptées.');
        }
      }
      data['seats'] = seats;
      data['seekingRoles'] = (Object.keys(seats) as CreatorRole[]).filter((r) => (seats[r] ?? 0) > 0);
    }

    let newClosesAt: Date | null = null;
    if (dto.deadline !== undefined) {
      newClosesAt = new Date(dto.deadline);
      data['closesAt'] = newClosesAt;
    }

    const updated = (await this.prisma.projectCall.update({ where: { id }, data })) as unknown as CallRow;

    if (newClosesAt) {
      // F4: versioned key — the create-time `close-call-${id}` key would be deduped by BullMQ, so a
      // stale job from the old deadline would survive. A new key re-arms; the processor's `closesAt`
      // guard neutralises the stale one. (':' is illegal in BullMQ custom ids — hyphens only.)
      await this.queue.enqueue(
        'calls',
        'close-call',
        { callId: id },
        { delayMs: Math.max(0, newClosesAt.getTime() - Date.now()), idempotencyKey: `close-call-${id}-${newClosesAt.getTime()}` },
      );
    }

    const [assetMedia, viewerRoles] = await Promise.all([
      this.loadCallAssetMedia([id]),
      this.getViewerRoles(viewerId),
    ]);
    return this.mapCard(updated, viewerId, assetMedia, viewerRoles, null, acceptedByRole);
  }

  // ── MC-7 round 3: owner delete (DELETE /calls/:id) ───────────────────────────
  /**
   * Owner delete of a call. Refused (409) if ANY application is `accepted` — that's a started
   * collaboration (MC-8 seam) and the counterpart's MC-6 history; the escape hatch is close-early.
   * Otherwise pending/rejected applications cascade-delete at the DB level (Application.call
   * onDelete: Cascade → ApplicationAsset / ProjectCallAsset cascade beneath). No notification is sent
   * to pending applicants.
   * ponytail: no 'call withdrawn' notif — add a NotifType if applicant confusion shows up.
   */
  async deleteCall(viewerId: string, id: string): Promise<void> {
    const row = (await this.prisma.projectCall.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    })) as { authorId: string | null } | null;
    if (!row) throw new NotFoundException('Appel introuvable.');
    if (row.authorId !== viewerId) throw new ForbiddenException('Seul l’auteur peut supprimer cet appel.');

    const accepted = await this.prisma.application.count({ where: { callId: id, status: 'accepted' } });
    if (accepted > 0) {
      throw new ConflictException(
        'Impossible de supprimer : des candidatures ont déjà été acceptées. Clôturez l’appel plutôt.',
      );
    }
    await this.prisma.projectCall.delete({ where: { id } });
  }

  // ── MC-5 apply "Candidater" (MC-4X: role-gated, server-derived appliedAs, multi-sample) ─────
  async apply(viewerId: string, callId: string, dto: ApplyToCallDto): Promise<ApplicationDto> {
    const call = (await this.prisma.projectCall.findUnique({ where: { id: callId } })) as
      | Pick<CallRow, 'authorId' | 'status' | 'closesAt' | 'seekingRoles'>
      | null;
    if (!call) throw new NotFoundException('Cet appel est introuvable.');
    if (call.authorId === viewerId) {
      throw new ForbiddenException('Vous ne pouvez pas candidater à votre propre appel.');
    }
    // Derived closure — never trust the stored column alone (mirrors board read / auto-close lag).
    if (derivedStatus(call) === 'closed') throw new ConflictException('Cet appel est clôturé.');

    const dupe = await this.prisma.application.findFirst({ where: { callId, applicantId: viewerId } });
    if (dupe) throw new ConflictException('Vous avez déjà candidaté à cet appel.');

    // MC-4X req6 role gate: the applicant must hold AT LEAST ONE of the sought roles.
    const roles = await this.getViewerRoles(viewerId);
    const intersection = call.seekingRoles.filter((r) => roles.includes(r));
    if (intersection.length === 0) throw new ForbiddenException(roleGateMessage(call.seekingRoles));
    // appliedAs = the single matching role; when >1 matches, honour an explicit choice restricted to
    // the intersection (the FE chooser) — 400 outside it — else default to the first match.
    let appliedAs: CreatorRole;
    if (dto.appliedAs !== undefined) {
      if (!intersection.includes(dto.appliedAs)) {
        throw new BadRequestException("Ce rôle n'est pas disponible pour cet appel.");
      }
      appliedAs = dto.appliedAs;
    } else {
      appliedAs = intersection[0] as CreatorRole;
    }

    // MC-4X: 1..3 mixed samples, each validated (ownership/kind/ready) in a batched query.
    const samples = await this.resolveApplicationSamples(viewerId, dto.samples);
    const sampleUrl = samples[0].url; // denormalized first-sample thumbnail

    // AD-6: ban check joins here when the schema gains the flag (deferred — no ban column yet).
    try {
      const [application] = await this.prisma.$transaction([
        this.prisma.application.create({
          data: {
            callId,
            applicantId: viewerId,
            sampleUrl,
            message: dto.message ?? '',
            appliedAs,
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
          include: APPLICANT_INCLUDE,
        }),
        this.prisma.projectCall.update({
          where: { id: callId },
          data: { applicationCount: { increment: 1 } },
        }),
      ]);

      const row = application as unknown as ApplicationRow;
      // F-5: notify the owner (seed calls with authorId null simply skip it).
      if (call.authorId) {
        await this.notifications.create({
          recipientId: call.authorId,
          type: 'application',
          refId: row.id,
          sourceUserId: viewerId,
        });
      }
      return toApplicationDto(row);
    } catch (e) {
      // Unique index (callId, applicantId) race backstop → same duplicate 409 as the service check.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Vous avez déjà candidaté à cet appel.');
      }
      throw e;
    }
  }

  /**
   * MC-4X: validate 1..3 mixed application samples in a batched query. Each ref is XOR
   * (mediaId or portfolioItemId). Media must be owned + ready + kind application_sample (image,
   * thumb url) or application_document (PDF, orig url + size); portfolio items must belong to the
   * applicant. Returns the resolved samples in request order (position). 400 on any invalid ref.
   */
  private async resolveApplicationSamples(
    viewerId: string,
    refs: { mediaId?: string; portfolioItemId?: string }[] | undefined,
  ): Promise<ResolvedSample[]> {
    if (!Array.isArray(refs) || refs.length === 0) {
      throw new BadRequestException('Ajoutez un échantillon de votre travail.');
    }
    if (refs.length > APPLICATION_MAX_SAMPLES) {
      throw new BadRequestException(`Trois échantillons maximum.`);
    }
    for (const r of refs) {
      const hasMedia = !!r.mediaId;
      const hasPortfolio = !!r.portfolioItemId;
      if (hasMedia === hasPortfolio) throw new BadRequestException('Cet échantillon est invalide.');
    }

    const mediaIds = refs.map((r) => r.mediaId).filter((v): v is string => !!v);
    const portfolioIds = refs.map((r) => r.portfolioItemId).filter((v): v is string => !!v);

    const [media, items] = await Promise.all([
      mediaIds.length
        ? (this.prisma.media.findMany({
            where: { id: { in: mediaIds } },
            select: { id: true, ownerId: true, status: true, kind: true, size: true, variants: true },
          }) as Promise<MediaSampleRow[]>)
        : Promise.resolve([] as MediaSampleRow[]),
      portfolioIds.length
        ? (this.prisma.portfolioItem.findMany({
            where: { id: { in: portfolioIds } },
            select: { id: true, image: true, profile: { select: { accountId: true } } },
          }) as Promise<PortfolioSampleRow[]>)
        : Promise.resolve([] as PortfolioSampleRow[]),
    ]);
    const mediaById = new Map(media.map((m) => [m.id, m]));
    const itemById = new Map(items.map((i) => [i.id, i]));

    return refs.map((r) => {
      if (r.mediaId) {
        const m = mediaById.get(r.mediaId);
        if (!m || m.ownerId !== viewerId || m.status !== 'ready') {
          throw new BadRequestException('Cet échantillon est invalide.');
        }
        if (m.kind === 'application_sample' && m.variants?.thumb) {
          return { mediaId: m.id, url: m.variants.thumb, kind: 'image', size: null };
        }
        if (m.kind === 'application_document' && m.variants?.orig) {
          return { mediaId: m.id, url: m.variants.orig, kind: 'document', size: m.size ?? null };
        }
        throw new BadRequestException('Cet échantillon est invalide.');
      }
      const item = itemById.get(r.portfolioItemId as string);
      if (!item || item.profile?.accountId !== viewerId) {
        throw new BadRequestException('Cet échantillon est invalide.');
      }
      return { portfolioItemId: item.id, url: item.image, kind: 'image', size: null };
    });
  }

  // ── MC-4X: GET /calls/:id detail ─────────────────────────────────────────────
  async findDetail(viewerId: string, id: string): Promise<CallDetail> {
    const row = (await this.prisma.projectCall.findUnique({ where: { id } })) as unknown as CallRow | null;
    if (!row) throw new NotFoundException('Appel introuvable.');

    const [assetMedia, appliedIds, viewerRoles, team, acceptedByRole] = await Promise.all([
      this.loadCallAssetMedia([id]),
      this.resolveApplied([row], viewerId),
      this.getViewerRoles(viewerId),
      this.buildTeam(row),
      this.resolveAcceptedByRole([id]),
    ]);
    const assets = assetMedia.get(id) ?? [];

    const samples = assets
      .filter((a) => a.kind === 'call_sample' && a.variants?.web)
      .map((a) => a.variants!.web as string);
    const documents: CallDocument[] = assets
      .filter((a) => a.kind === 'call_document' && a.variants?.orig)
      .map((a) => ({ mediaId: '', url: a.variants!.orig as string, size: a.size ?? 0 }));

    const card = this.mapCard(row, viewerId, assetMedia, viewerRoles, appliedIds.get(id) ?? null, acceptedByRole.get(id) ?? {});
    return {
      ...card,
      createdAt: row.createdAt.toISOString(),
      samples,
      documents,
      team,
      // MC-7 F5: raw values for the owner edit-form pre-fill (already loaded — no extra query).
      genres: row.genres,
      format: (row.format as CallFormat | null) ?? null,
      scope: row.scope ?? null,
    };
  }

  /**
   * MC-4X req6 team: the call author + (when a project is linked) that project's accepted-invitation
   * counterparts + everyone whose application on THIS call was accepted. Deduped by userId, author
   * first. Batched: one account fetch + one accepted-applications query + one accepted-invitations
   * query (only when projectId is set) — no N+1.
   */
  private async buildTeam(row: CallRow): Promise<InvitationUserRef[]> {
    const [author, acceptedApps, invitations] = await Promise.all([
      row.authorId
        ? (this.prisma.account.findUnique({ where: { id: row.authorId }, select: ACCOUNT_REF_SELECT }) as Promise<AccountRefRow | null>)
        : Promise.resolve(null),
      this.prisma.application.findMany({
        where: { callId: row.id, status: 'accepted' },
        select: { applicant: { select: ACCOUNT_REF_SELECT } },
      }) as Promise<{ applicant: AccountRefRow }[]>,
      row.projectId
        ? (this.prisma.invitation.findMany({
            where: { projectId: row.projectId, status: 'accepted' },
            select: { fromUser: { select: ACCOUNT_REF_SELECT }, toUser: { select: ACCOUNT_REF_SELECT } },
          }) as Promise<{ fromUser: AccountRefRow; toUser: AccountRefRow }[]>)
        : Promise.resolve([] as { fromUser: AccountRefRow; toUser: AccountRefRow }[]),
    ]);

    const members: AccountRefRow[] = [];
    if (author) members.push(author);
    for (const inv of invitations) members.push(inv.fromUser, inv.toUser);
    for (const a of acceptedApps) members.push(a.applicant);

    const seen = new Set<string>();
    const team: InvitationUserRef[] = [];
    for (const m of members) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      team.push(accountToUserRef(m));
    }
    return team;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  /**
   * Batched per-call asset media (samples + documents), position-ordered, ready-only. Pending/
   * failed media are silently omitted. One projectCallAsset query + one media query (no N+1).
   * Also carries the resolved mediaId so detail documents can expose it.
   */
  private async loadCallAssetMedia(callIds: string[]): Promise<Map<string, AssetMediaWithId[]>> {
    if (callIds.length === 0) return new Map();
    const assets = (await this.prisma.projectCallAsset.findMany({
      where: { callId: { in: callIds } },
      orderBy: { position: 'asc' },
      select: { callId: true, mediaId: true, position: true },
    })) as { callId: string; mediaId: string; position: number }[];
    if (assets.length === 0) return new Map();

    const mediaIds = [...new Set(assets.map((a) => a.mediaId))];
    const media = (await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, status: 'ready' },
      select: { id: true, kind: true, variants: true, size: true },
    })) as { id: string; kind: string; variants: AssetMedia['variants']; size: number | null }[];
    const byId = new Map(media.map((m) => [m.id, m]));

    const out = new Map<string, AssetMediaWithId[]>();
    for (const a of assets) {
      const m = byId.get(a.mediaId);
      if (!m) continue; // pending/failed omitted
      const arr = out.get(a.callId) ?? [];
      arr.push({ position: a.position, kind: m.kind, variants: m.variants, size: m.size, mediaId: m.id });
      out.set(a.callId, arr);
    }
    return out;
  }

  /** First ready call_sample thumb for a call (min position — assets are position-ordered). */
  private firstSampleThumb(assets: AssetMedia[] | undefined): string | null {
    const s = assets?.find((a) => a.kind === 'call_sample' && a.variants?.thumb);
    return s?.variants?.thumb ?? null;
  }

  private mapCard(
    row: CallRow,
    viewerId: string,
    assetMedia: Map<string, AssetMedia[]>,
    viewerRoles: string[],
    myApplicationId: string | null = null,
    acceptedByRole: SeatCounts = {},
  ): CallCard {
    const seats = (row.seats ?? {}) as SeatCounts;
    return {
      ...mapPreview(row),
      direction: directionOf(row.authorRoles[0] ?? 'scenariste'),
      seekingRoles: row.seekingRoles as CreatorRole[],
      seats,
      acceptedByRole,
      remainingSeats: remainingSeatsOf(seats, acceptedByRole),
      description: row.description,
      sampleUrl: this.firstSampleThumb(assetMedia.get(row.id)),
      status: derivedStatus(row),
      deadline: row.closesAt ? row.closesAt.toISOString() : null,
      isOwner: !!row.authorId && row.authorId === viewerId,
      // MC-5: owner can never have applied ⇒ create/close paths pass null.
      hasApplied: myApplicationId !== null,
      myApplicationId,
      // MC-4X req6: viewer holds AT LEAST ONE sought role ⇒ gate open.
      viewerHasRole: row.seekingRoles.some((r) => viewerRoles.includes(r)),
    };
  }

  /**
   * MC-4X §8 seam — MC-7's accept flow calls this after flipping an application to `accepted`.
   * When every sought seat is covered by accepted applications, closes the call. Idempotent and
   * race-safe: the guarded `updateMany` (where status='open') is the atomic gate — a second call,
   * or a concurrent one, is a no-op. Returns true only when THIS call performed the close.
   */
  async closeIfFilled(callId: string): Promise<boolean> {
    const call = (await this.prisma.projectCall.findUnique({
      where: { id: callId },
      select: { id: true, status: true, seats: true },
    })) as { status: string; seats: SeatCounts } | null;
    if (!call || call.status === 'closed') return false;

    const seats = (call.seats ?? {}) as SeatCounts;
    const roles = (Object.keys(seats) as CreatorRole[]).filter((r) => (seats[r] ?? 0) > 0);
    if (roles.length === 0) return false;

    const accepted = (await this.resolveAcceptedByRole([callId])).get(callId) ?? {};
    const filled = roles.every((r) => (accepted[r] ?? 0) >= (seats[r] ?? 0));
    if (!filled) return false;

    const res = (await this.prisma.projectCall.updateMany({
      where: { id: callId, status: 'open' },
      data: { status: 'closed' },
    })) as { count: number };
    return res.count > 0;
  }
}

interface AssetMediaWithId extends AssetMedia {
  mediaId: string;
}

interface MediaSampleRow {
  id: string;
  ownerId: string;
  status: string;
  kind: string;
  size: number | null;
  variants: { thumb?: string; orig?: string } | null;
}

interface PortfolioSampleRow {
  id: string;
  image: string;
  profile: { accountId: string } | null;
}

/** A validated application sample ready to persist as an ApplicationAsset row. */
interface ResolvedSample {
  mediaId?: string;
  portfolioItemId?: string;
  url: string;
  kind: 'image' | 'document';
  size: number | null;
}

/** Dedupe an optional id list, preserving order. */
function dedupe(ids: string[] | undefined): string[] {
  return ids ? [...new Set(ids)] : [];
}

// ── MC-5 application mapping ──────────────────────────────────────────────────
const APPLICANT_INCLUDE = {
  applicant: {
    select: {
      id: true,
      displayName: true,
      profileSlug: true,
      avatar: true,
      profile: { select: { creatorRoles: true } },
    },
  },
  assets: { orderBy: { position: 'asc' as const } },
};

interface ApplicationRow {
  id: string;
  callId: string;
  sampleUrl: string;
  message: string;
  status: string;
  appliedAs: string | null;
  createdAt: Date;
  applicant: {
    id: string;
    displayName: string;
    profileSlug: string;
    avatar: string | null;
    profile: { creatorRoles: string[] } | null;
  };
  assets: { url: string; kind: string; size: number | null; position: number }[];
}

/** MC-4X: map ApplicationAsset rows (position-ordered) → the shared ApplicationSample display shape. */
export function toApplicationSamples(assets: { url: string; kind: string; size: number | null }[]): ApplicationSample[] {
  return assets.map((a) => ({ url: a.url, kind: a.kind === 'document' ? 'document' : 'image', size: a.size ?? null }));
}

// MC-4X req6: shared account→ref select/shape/mapper (applicant refs AND team members).
// Exported for MC-7 ReceivedApplicationsService (same applicant ref shape).
export const ACCOUNT_REF_SELECT = {
  id: true,
  displayName: true,
  profileSlug: true,
  avatar: true,
  profile: { select: { creatorRoles: true } },
} as const;

interface AccountRefRow {
  id: string;
  displayName: string;
  profileSlug: string;
  avatar: string | null;
  profile: { creatorRoles: string[] } | null;
}

function accountToUserRef(u: AccountRefRow): InvitationUserRef {
  return {
    userId: u.id,
    name: u.displayName,
    slug: u.profileSlug,
    avatarUrl: u.avatar,
    role: (u.profile?.creatorRoles?.[0] ?? null) as CreatorRole | null,
  };
}

// Exported for MC-7 ReceivedApplicationsService — same row → ApplicationDto mapping.
export function toApplicationDto(row: ApplicationRow): ApplicationDto {
  return {
    id: row.id,
    callId: row.callId,
    applicant: accountToUserRef(row.applicant),
    sampleUrl: row.sampleUrl,
    samples: toApplicationSamples(row.assets ?? []),
    message: row.message,
    status: row.status as ApplicationDto['status'],
    appliedAs: (row.appliedAs ?? null) as CreatorRole | null,
    createdAt: row.createdAt.toISOString(),
  };
}

function composeTags(genreIds: string[], scope?: string, format?: CallFormat): string[] {
  const labels = genreIds.map((id) => GENRE_FR.get(id) ?? id);
  if (scope) return [...labels, scope];
  if (format) return [...labels, CALL_FORMAT_LABELS[format]];
  return labels;
}

/**
 * MC-4X §8: sanitise seat counts (trust boundary — DTO also validates). Keeps only known roles with
 * a positive integer count, caps each at CALL_MAX_SEATS_PER_ROLE. 400 if no seat is requested.
 */
function normalizeSeats(seats: SeatCounts | undefined): SeatCounts {
  const out: SeatCounts = {};
  for (const r of CREATOR_ROLES) {
    const n = seats?.[r];
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) {
      out[r] = Math.min(n, CALL_MAX_SEATS_PER_ROLE);
    }
  }
  if (Object.keys(out).length === 0) throw new BadRequestException('Indiquez au moins un poste recherché.');
  return out;
}

function mapPreview(row: Pick<CallRow, 'id' | 'authorRoles' | 'seekingRoles' | 'title' | 'tags' | 'authorName' | 'closesAt' | 'applicationCount'>): CallPreview {
  return {
    id: row.id,
    heading: heading(row.authorRoles, row.seekingRoles),
    title: row.title,
    tags: row.tags,
    authorName: row.authorName,
    closesInDays: row.closesAt ? Math.max(0, Math.ceil((row.closesAt.getTime() - Date.now()) / DAY_MS)) : null,
    applicationCount: row.applicationCount,
  };
}
