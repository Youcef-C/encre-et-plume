import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  CreatorRole,
  MyProjectItem,
  MyProjectsResponse,
  MyProjectsSummary,
  ProjectMemberRef,
  ProjectSeeking,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTypeFilter,
  ProjectVisibility,
  ProjectWorkspaceResponse,
  RevenueSplitEntry,
  SeatCounts,
  UpdateProjectInfoRequest,
  UpdateProjectInfoResponse,
  WorkspaceMember,
  WorkspaceReview,
  WorkspaceReviewSummary,
} from '@encre-et-plume/shared';
import { GENRES, PROJECTS_PAGE_SIZE, catalogGenreLabel, normalizeHashtags } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WORKSPACE_PAGE_INCLUDE, toWorkspacePage } from './pages.service';
import { CollectionsService, buildSoutien } from '../collections/collections.service';
import { SlugService } from '../slug/slug.service';
import { MediaService } from '../media/media.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CallsService } from '../calls/calls.service';
import type { ParsedMyProjectsQuery } from './parse-my-projects-query';

const GENRE_IDS = new Set(GENRES.map((g) => g.id));
const DEFAULT_GENRE = 'Art'; // Work.genre is required; mirrors the collections default when no genre picked

/** CS-1 §1: Série/One Shot × type → the Work's CATALOG_FORMATS value (One-shot is type-agnostic). */
function mapFormat(type: 'manga' | 'story', format: 'serie' | 'oneshot'): string {
  if (format === 'oneshot') return 'One-shot';
  return type === 'manga' ? 'Manga' : 'Roman';
}

/** Canonical order for the two role icons (pen ✒ then brush 🖌). */
const ICON_ROLES = ['scenariste', 'dessinateur'] as const;

/**
 * A member's role icons from their profile creatorRoles (both when both are active), in canonical
 * order. Falls back to their per-project WorkCreator role when the profile declares neither.
 */
function iconRoles(creatorRoles: string[] | null | undefined, workRole: string): string[] {
  const active = ICON_ROLES.filter((r) => creatorRoles?.includes(r));
  if (active.length > 0) return active;
  return ICON_ROLES.includes(workRole as (typeof ICON_ROLES)[number]) ? [workRole] : [];
}

/** Owner's first membership role (CS-10 seam) — first creator role, else 'scenariste'. */
function firstCreatorRole(roles?: string[] | null): string {
  return roles?.find((r) => r === 'scenariste' || r === 'dessinateur') ?? 'scenariste';
}

/** "Je recherche" counters → SeatCounts, keeping only positive integer counts (trust boundary clamp). */
function seatsFromSeeking(seeking?: ProjectSeeking): SeatCounts {
  const out: SeatCounts = {};
  for (const role of ['scenariste', 'dessinateur'] as const) {
    const n = seeking?.[role];
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) out[role] = Math.min(n, 5);
  }
  return out;
}

/** Maps a Project row to the picker summary; meta = "kind · genre · status" (genre omitted when null). */
export function toProjectSummary(p: {
  id: string;
  title: string;
  kind: string;
  genre: string | null;
  status: string;
  cover: string | null;
  slug?: string | null;
}): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    meta: [p.kind, p.genre, p.status].filter(Boolean).join(' · '),
    cover: p.cover,
    slug: p.slug ?? null,
  };
}

const ACTIVE_STATUSES = new Set(['en cours', 'en révision']);

/** CS-12: dashboard type chip → keeps rows by `kind` (illustrations/collections) or, for series, by the
 *  emitted project `type` badge (label-insensitive so a label tweak never silently drops rows). */
function typeMatches(filter: ProjectTypeFilter, row: { kind?: string; type?: string }): boolean {
  switch (filter) {
    case 'tous':
      return true;
    case 'collections':
      return row.kind === 'collection';
    case 'illustrations':
      return row.kind === 'illustration';
    case 'manga':
      return row.kind === 'project' && (row.type ?? '').toLowerCase().startsWith('manga');
    case 'histoire':
      return row.kind === 'project' && (row.type ?? '').toLowerCase().startsWith('histoire');
    default:
      return true;
  }
}

/** CS-12: dashboard status chip → the concrete Project.status values it matches. Status is series-only;
 *  a null-status row (illustration/collection) matches only "tous". */
function statusMatches(filter: ProjectStatusFilter, status: string | null): boolean {
  if (filter === 'tous') return true;
  if (status === null) return false;
  switch (filter) {
    case 'en-cours':
      return ACTIVE_STATUSES.has(status);
    case 'en-pause':
      return status === 'en pause';
    case 'publies':
      // CS-1 §11: a published one-shot reads "terminé" — the "publies" chip matches both.
      return status === 'publié' || status === 'terminé';
    default:
      return true; // 'tous'
  }
}

type InviteeRow = { status: string; toUser: { id: string; displayName: string; profile: { creatorRoles: string[] } | null } };
type OwnerRow = { id: string; displayName: string; profile: { creatorRoles: string[] } | null };

/**
 * CS-1 seam extended for CS-12 ("Mes projets"). The legacy `scope='projects'` path is byte-for-byte
 * the old MC-3/MC-4 picker (single owner-scoped query → bare ProjectSummary). The `scope='all'` path
 * folds the caller's illustration collections (reusing CollectionsService.getMine) into a merged,
 * searchable, status-filtered, paginated dashboard listing with a derived summary.
 */
@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
    private readonly slug: SlugService,
    private readonly media: MediaService,
    private readonly invitations: InvitationsService,
    private readonly calls: CallsService,
  ) {}

  /**
   * CS-1 POST /projects — the "Nouveau projet" wizard (manga/histoire). Creates the Project AND its
   * seeded Work/œuvre in ONE $transaction, sharing one unique slug (so /projet/{slug} and
   * /oeuvre/{slug} resolve). Œuvre metadata → Work (unpublished at creation); workspace/collab →
   * Project. Side effects (MC-3 invites, MC-4 call, contest link, raw Soutien) run after the tx;
   * a side-effect failure never rolls back the created project.
   */
  async create(accountId: string, dto: CreateProjectRequest): Promise<CreateProjectResponse> {
    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Un titre est requis');

    const type = dto.type;
    const format = dto.format ?? 'serie';
    const visibility = dto.visibility ?? 'prive';
    const audienceRating = dto.audienceRating ?? 'Tous publics';

    const genreLabel = dto.genre ? this.resolveGenreLabel(dto.genre) : null;
    const themeLabels = (dto.themes ?? []).map((id) => this.resolveGenreLabel(id));

    const invites = [...new Set(dto.invites ?? [])];
    this.assertRevenueSplit(dto.revenueSplit, new Set([accountId, ...invites]));

    const contestId = await this.collections.resolveContestId(dto.contestId ?? undefined);
    const soutien = buildSoutien(dto);

    const owner = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { displayName: true, profile: { select: { creatorRoles: true } } },
    });
    const ownerName = owner?.displayName ?? '';
    const ownerRole = firstCreatorRole(owner?.profile?.creatorRoles);

    const coverUrl = dto.cover?.mediaId ? await this.resolveCover(accountId, dto.cover.mediaId) : null;
    const slug = await this.uniqueProjectAndWorkSlug(this.slug.slugify(title) || 'projet');
    const goals = dto.goals ?? [];

    const { project, workId } = await this.prisma.$transaction(async (tx) => {
      const work = await tx.work.create({
        data: {
          slug,
          title,
          format: mapFormat(type, format),
          genre: genreLabel ?? DEFAULT_GENRE,
          themes: themeLabels,
          synopsis: dto.synopsis ?? null,
          hashtags: normalizeHashtags(dto.hashtags ?? []),
          meta: `${ownerName} · 0 ch.`,
          audienceRating,
          publishedAt: null, // unpublished at creation — PUB-1/CS-9 publish later
          coverImage: coverUrl,
          contestId: contestId ?? null,
          soutien: (soutien ?? undefined) as never, // Prisma Json input
        },
      });
      // CS-10 seam: owner is the order-0 WorkCreator (Creator role).
      await tx.workCreator.create({ data: { workId: work.id, accountId, role: ownerRole, order: 0 } });
      for (let i = 0; i < goals.length; i++) {
        await tx.fundingGoal.create({
          data: { workId: work.id, title: goals[i].title, targetCents: goals[i].targetCents, currentCents: 0, order: i },
        });
      }
      const project = await tx.project.create({
        data: {
          ownerId: accountId,
          title,
          kind: type === 'manga' ? 'Manga' : 'Histoire (illustrée)',
          genre: genreLabel, // null when no genre picked (picker meta line)
          status: 'en cours',
          cover: coverUrl,
          slug,
          workId: work.id,
          visibility,
        },
      });
      return { project: project as { id: string }, workId: work.id };
    });

    await this.seedSideEffects(accountId, project.id, title, dto, invites);
    return { id: project.id, slug, workId, title };
  }

  /** F-20 id → fr label; unknown id → 400 (never trust a client genre value). */
  private resolveGenreLabel(id: string): string {
    if (!GENRE_IDS.has(id)) throw new BadRequestException('Genre invalide');
    return catalogGenreLabel(id);
  }

  /** revenueSplit must total 100 % and only reference the owner or an invitee (400 otherwise). */
  private assertRevenueSplit(split: RevenueSplitEntry[] | undefined, memberIds: Set<string>): void {
    if (!split || split.length === 0) return;
    if (split.reduce((s, r) => s + r.pct, 0) !== 100) {
      throw new BadRequestException('Le partage des revenus doit totaliser 100 %.');
    }
    for (const r of split) {
      if (!memberIds.has(r.accountId)) throw new BadRequestException('Le partage des revenus inclut un membre inconnu.');
    }
  }

  /** Resolve an owned, ready cover media (kind 'cover') → its public URL. Bad kind/status → 400. */
  private async resolveCover(accountId: string, mediaId: string): Promise<string | null> {
    const m = await this.media.getForOwner(accountId, mediaId); // enforces ownership (403/404)
    if (m.kind !== 'cover') throw new BadRequestException('Le média doit être une couverture');
    if (m.status !== 'ready') throw new BadRequestException("La couverture n'est pas encore prête");
    const web = (m.variants as { web?: string }).web ?? null;
    if (!web) throw new BadRequestException("La couverture n'est pas encore prête");
    return web;
  }

  /** `base` if free, else `base-2`, `base-3`, … — unique across BOTH Work.slug and Project.slug. */
  private async uniqueProjectAndWorkSlug(base: string): Promise<string> {
    const [works, projects] = await Promise.all([
      this.prisma.work.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } }),
      this.prisma.project.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } }),
    ]);
    const taken = new Set<string>([...works.map((w) => w.slug), ...projects.map((p) => p.slug).filter((s): s is string => !!s)]);
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }

  /**
   * CS-1 side effects (post-transaction, best-effort). Each is isolated so one failure never rolls
   * back the project nor blocks the others. MR/CS-10 normalization is deferred — Soutien is already
   * persisted raw on the Work inside the transaction.
   */
  private async seedSideEffects(
    ownerId: string,
    projectId: string,
    title: string,
    dto: CreateProjectRequest,
    invites: string[],
  ): Promise<void> {
    if (invites.length > 0) {
      try {
        await this.invitations.create(ownerId, { toUsers: invites, projectId });
      } catch (e) {
        this.logger.error(`CS-1 invite fan-out failed for project ${projectId}: ${(e as Error).message}`);
      }
    }
    const seats = seatsFromSeeking(dto.seeking);
    if (Object.keys(seats).length > 0) {
      try {
        const genreIds = [dto.genre, ...(dto.themes ?? [])].filter((g): g is string => !!g);
        await this.calls.seedFromProject(ownerId, { projectId, title, seats, genres: genreIds, description: dto.synopsis ?? '' });
      } catch (e) {
        this.logger.error(`CS-1 call seed failed for project ${projectId}: ${(e as Error).message}`);
      }
    }
  }

  async getMine(accountId: string, query?: ParsedMyProjectsQuery): Promise<MyProjectsResponse> {
    if (!query || query.scope === 'projects') return this.legacyPicker(accountId);
    return this.dashboard(accountId, query);
  }

  // ponytail: single owner-scoped query — MC-3/MC-4 picker path. Additively carries slug/kind/type so
  // the CS-2 workspace project switcher can list ALL of the owner's manga/roman projects (every Project
  // row is a manga/roman — illustrations/collections are separate models — so no type filtering here).
  private async legacyPicker(accountId: string): Promise<MyProjectsResponse> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((p) => ({
        ...toProjectSummary(p),
        slug: p.slug,
        kind: 'project' as const,
        type: p.kind, // display label, e.g. "Manga" / "Histoire"
        status: p.status,
      })),
    };
  }

  private async dashboard(accountId: string, query: ParsedMyProjectsQuery): Promise<MyProjectsResponse> {
    const [projects, owner, collections, illustrations] = await Promise.all([
      this.prisma.project.findMany({
        // CS-12 bugfix: owned OR member (a WorkCreator on the linked Work — e.g. after accepting a
        // collaboration invite). SQL OR never duplicates a Project row; the loop dedupes by id anyway.
        where: { OR: [{ ownerId: accountId }, { work: { creators: { some: { accountId } } } }] },
        include: {
          // CS-1 §11: the linked œuvre drives the "terminé" status for a published one-shot.
          work: { select: { format: true, publishedAt: true } },
          owner: { select: { id: true, displayName: true, profile: { select: { creatorRoles: true } } } },
          invitations: {
            where: { status: 'accepted' },
            include: { toUser: { select: { id: true, displayName: true, profile: { select: { creatorRoles: true } } } } },
          },
        },
      }),
      this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true, displayName: true, profile: { select: { creatorRoles: true } } } }),
      this.collections.getMine(accountId),
      // Illustrations: owned, private/unpublished included (owner view). In the `illustrations` view we
      // want EVERY illustration as a flat row (drop the membership filter); in every other view only the
      // UNCOLLECTED ones (collected ones already surface via their collection row — no double-count).
      this.prisma.illustration.findMany({
        where:
          query.type === 'illustrations'
            ? { artistId: accountId }
            : { artistId: accountId, collections: { none: {} } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      }),
    ]);

    const ownerRef: ProjectMemberRef = {
      id: accountId,
      name: owner?.displayName ?? '',
      role: firstRole(owner?.profile?.creatorRoles),
      self: true,
    };

    type Row = MyProjectItem & { _createdAt: number };
    const rows: Row[] = [];

    const seen = new Set<string>();
    for (const p of projects as unknown as Array<Record<string, unknown> & { invitations: InviteeRow[]; owner: OwnerRow | null }>) {
      const projectId = p['id'] as string;
      if (seen.has(projectId)) continue; // ponytail: SQL OR never dups, but guard the merged set anyway
      seen.add(projectId);
      const ownerId = p['ownerId'] as string;
      const isOwner = ownerId === accountId;
      // Members: the ACTUAL project owner first (self when the caller owns it), then accepted invitees
      // (self when an invitee is the caller — the collaboration path that lands them on this dashboard).
      const projectOwnerRef: ProjectMemberRef = {
        id: ownerId,
        name: p.owner?.displayName ?? '',
        role: firstRole(p.owner?.profile?.creatorRoles),
        self: isOwner,
      };
      const members: ProjectMemberRef[] = [
        projectOwnerRef,
        ...p.invitations
          .filter((inv) => inv.status === 'accepted')
          .map((inv) => ({
          id: inv.toUser.id,
          name: inv.toUser.displayName,
          role: firstRole(inv.toUser.profile?.creatorRoles),
          self: inv.toUser.id === accountId,
          })),
      ];
      const nextReleaseAt = p['nextReleaseAt'] as Date | null;
      // CS-1 §11: a published one-shot (linked Work format 'One-shot' + publishedAt set) reads "terminé".
      const work = p['work'] as { format: string; publishedAt: Date | null } | null;
      const status =
        work?.format === 'One-shot' && work.publishedAt !== null ? 'terminé' : (p['status'] as string);
      rows.push({
        ...toProjectSummary(p as never),
        slug: (p['slug'] as string | null) ?? null,
        type: p['kind'] as string,
        status,
        isOwner,
        members,
        step: (p['step'] as string | null) ?? null,
        nextReleaseAt: nextReleaseAt ? nextReleaseAt.toISOString() : null,
        kind: 'project',
        illustrationCount: null,
        _createdAt: (p['createdAt'] as Date).getTime(),
      });
    }

    for (const c of collections) {
      rows.push({
        id: c.id,
        title: c.title,
        meta: `${c.count} illustration${c.count === 1 ? '' : 's'}`,
        cover: c.cover,
        slug: c.slug, // Work slug → FE builds Voir /oeuvre/{slug}
        type: 'Illustration(s)',
        // Status is series-only — collections/illustrations have no lifecycle state on Work, so null
        // (not "en cours"). They match only the "tous" status chip and never count toward summary.active.
        status: null,
        isOwner: true, // collections are always the caller's own
        members: [ownerRef],
        step: null,
        nextReleaseAt: null,
        kind: 'collection',
        illustrationCount: c.count,
        _createdAt: Date.now(), // getMine yields newest-first; keep that order among collections
      });
    }

    for (const il of illustrations as unknown as Array<{ id: string; title: string; image: string | null; createdAt: Date }>) {
      rows.push({
        id: il.id,
        title: il.title,
        meta: '', // no natural meta line for a lone illustration; FE composes "Solo · vous" from members
        cover: il.image,
        slug: null, // no workspace/collection route for a standalone illustration
        type: 'illustration',
        status: null, // series-only status; standalone illustrations carry none
        isOwner: true, // standalone illustrations are always the caller's own
        members: [ownerRef],
        step: null,
        nextReleaseAt: null,
        kind: 'illustration',
        illustrationCount: null,
        _createdAt: il.createdAt.getTime(),
      });
    }

    // ponytail: in-memory merge/filter — owner-scoped lists are tiny by construction; move to SQL if a
    // creator ever owns hundreds of projects+collections.
    const summary = deriveSummary(rows);

    const needle = query.q?.toLowerCase();
    const filtered = rows.filter(
      (r) =>
        statusMatches(query.status, r.status ?? null) &&
        typeMatches(query.type, r) &&
        (!needle || r.title.toLowerCase().includes(needle)),
    );
    filtered.sort((a, b) => b._createdAt - a._createdAt);

    const total = filtered.length;
    const start = (query.page - 1) * PROJECTS_PAGE_SIZE;
    const items = filtered.slice(start, start + PROJECTS_PAGE_SIZE).map(strip);

    return { items, total, page: query.page, pageSize: PROJECTS_PAGE_SIZE, summary };
  }

  // ── CS-2: project workspace "Espace projet" ────────────────────────────────

  /**
   * GET /projects/:slug — the full workspace payload. Members (owner or a WorkCreator on the
   * linked Work) get the full read; a non-member gets a read-only payload ONLY when the project is
   * public — private/invitation projects 404 for non-members (no existence leak).
   */
  async getWorkspace(accountId: string, slug: string): Promise<ProjectWorkspaceResponse> {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        work: {
          include: {
            creators: {
              orderBy: { order: 'asc' },
              include: {
                account: {
                  select: { id: true, displayName: true, avatar: true, profile: { select: { creatorRoles: true } } },
                },
              },
            },
            chapters: { orderBy: { number: 'asc' } },
            reviews: { orderBy: { createdAt: 'desc' } },
          },
        },
        pages: { orderBy: { createdAt: 'asc' }, include: WORKSPACE_PAGE_INCLUDE },
        labels: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!project || !project.work) throw new NotFoundException('Projet introuvable');

    const isOwner = project.ownerId === accountId;
    const isMember = isMemberOf(project, accountId);
    if (!isMember && project.visibility !== 'public') throw new NotFoundException('Projet introuvable');

    const work = project.work;
    const members: WorkspaceMember[] = work.creators.map((c) => ({
      accountId: c.accountId,
      displayName: c.account.displayName,
      avatar: c.account.avatar,
      // Show every active profile role (both icons if the user is scénariste AND dessinateur);
      // fall back to this member's WorkCreator role when the profile declares none.
      roles: iconRoles(c.account.profile?.creatorRoles, c.role),
    }));

    const allReviews = work.reviews.map(mapWorkspaceReview);
    return {
      id: project.id,
      slug: project.slug ?? slug,
      workSlug: work.slug,
      title: work.title,
      synopsis: work.synopsis ?? '',
      hashtags: work.hashtags,
      collabOpen: project.collabOpen,
      visibility: project.visibility as ProjectVisibility,
      cover: work.coverImage ?? null,
      members,
      chapters: work.chapters.map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        status: c.status,
        plancheCount: c.plancheCount,
      })),
      pages: project.pages.map((p) => toWorkspacePage(p as never)),
      labels: project.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
      reviews: { summary: reviewSummary(allReviews), items: allReviews.slice(0, 20) },
      viewer: { isMember, isOwner },
    };
  }

  /**
   * PATCH /projects/:slug — debounced field-level auto-save. Members only (owner or WorkCreator);
   * a non-member who could at least read it (public) gets 403, otherwise 404 (no leak). `title` writes
   * BOTH Project and Work so cards/catalog (Work) and the dashboard (Project) never drift; `cover`
   * takes an F-10 media reference (never bytes) and writes the resolved URL to Work.coverImage +
   * Project.cover.
   */
  async updateInfo(accountId: string, slug: string, body: UpdateProjectInfoRequest): Promise<UpdateProjectInfoResponse> {
    const project = await this.resolveMemberProject(accountId, slug);
    const work = project.work!; // resolveMemberProject guarantees a linked Work (else it 404s)

    const workUpdate: Record<string, unknown> = {};
    const projectUpdate: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) throw new BadRequestException('Un titre est requis');
      workUpdate.title = t;
      projectUpdate.title = t;
    }
    if (body.synopsis !== undefined) workUpdate.synopsis = body.synopsis;
    if (body.hashtags !== undefined) workUpdate.hashtags = normalizeHashtags(body.hashtags);
    if (body.collabOpen !== undefined) projectUpdate.collabOpen = body.collabOpen;
    if (body.cover !== undefined) {
      const url = body.cover === null ? null : await this.resolveCover(accountId, body.cover.mediaId);
      workUpdate.coverImage = url;
      projectUpdate.cover = url;
    }

    const ops = [];
    if (Object.keys(workUpdate).length > 0) ops.push(this.prisma.work.update({ where: { id: work.id }, data: workUpdate }));
    if (Object.keys(projectUpdate).length > 0) ops.push(this.prisma.project.update({ where: { id: project.id }, data: projectUpdate }));
    if (ops.length > 0) await this.prisma.$transaction(ops);

    return {
      title: (projectUpdate.title as string) ?? work.title,
      synopsis: (workUpdate.synopsis as string | undefined) ?? work.synopsis ?? '',
      hashtags: (workUpdate.hashtags as string[] | undefined) ?? work.hashtags,
      collabOpen: (projectUpdate.collabOpen as boolean | undefined) ?? project.collabOpen,
      cover: 'coverImage' in workUpdate ? (workUpdate.coverImage as string | null) : work.coverImage ?? null,
    };
  }

  /** Shared by PATCH /projects/:slug (and reused by page routes via the exported helper): resolve a
   *  project the caller is a member of. Unknown → 404; non-member public → 403; non-member private → 404. */
  private async resolveMemberProject(accountId: string, slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        work: { include: { creators: { select: { accountId: true } } } },
      },
    });
    if (!project || !project.work) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project, accountId)) {
      if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }
}

function firstRole(roles: string[] | undefined | null): CreatorRole | null {
  return (roles?.[0] as CreatorRole | undefined) ?? null;
}

/** CS-2 membership: the project owner OR a WorkCreator on the linked Work. Shared by the workspace
 *  read, the info PATCH, and the page routes (PagesService) — the single membership rule for CS-2. */
export function isMemberOf(
  project: { ownerId: string; work: { creators: { accountId: string }[] } | null },
  accountId: string,
): boolean {
  if (project.ownerId === accountId) return true;
  return project.work?.creators.some((c) => c.accountId === accountId) ?? false;
}

function mapWorkspaceReview(r: {
  id: string;
  authorName: string;
  storyRating: number;
  artRating: number;
  text: string;
  hidden: boolean;
  createdAt: Date;
}): WorkspaceReview {
  return {
    id: r.id,
    authorName: r.authorName,
    storyRating: r.storyRating,
    artRating: r.artRating,
    text: r.hidden ? '' : r.text, // blank hidden review text (moderation) — mirrors DR-3
    hidden: r.hidden,
    createdAt: r.createdAt.toISOString(),
  };
}

/** DR-3 review math, mirrored: overall = mean of per-review (story+art)/2; story/art = column means. */
function reviewSummary(reviews: WorkspaceReview[]): WorkspaceReviewSummary {
  const mean = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  return {
    overall: mean(reviews.map((r) => (r.storyRating + r.artRating) / 2)),
    story: mean(reviews.map((r) => r.storyRating)),
    art: mean(reviews.map((r) => r.artRating)),
    count: reviews.length,
  };
}

function strip(row: MyProjectItem & { _createdAt: number }): MyProjectItem {
  const { _createdAt, ...item } = row;
  void _createdAt;
  return item;
}

/** Summary is derived from the UNFILTERED merged set (story: counts reflect everything you own). */
function deriveSummary(rows: Array<MyProjectItem & { _createdAt: number }>): MyProjectsSummary {
  const now = Date.now();
  let active = 0;
  let enRevision = 0;
  let nextMs: number | null = null;
  for (const r of rows) {
    if (ACTIVE_STATUSES.has(r.status!)) active++;
    if (r.status === 'en révision') enRevision++;
    if (r.nextReleaseAt) {
      const t = new Date(r.nextReleaseAt).getTime();
      if (t > now && (nextMs === null || t < nextMs)) nextMs = t;
    }
  }
  return { active, enRevision, nextReleaseAt: nextMs === null ? null : new Date(nextMs).toISOString() };
}
