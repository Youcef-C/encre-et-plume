import { Injectable } from '@nestjs/common';
import type {
  CreatorRole,
  MyProjectItem,
  MyProjectsResponse,
  MyProjectsSummary,
  ProjectMemberRef,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectTypeFilter,
} from '@encre-et-plume/shared';
import { PROJECTS_PAGE_SIZE } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsService } from '../collections/collections.service';
import type { ParsedMyProjectsQuery } from './parse-my-projects-query';

/** Maps a Project row to the picker summary; meta = "kind · genre · status" (genre omitted when null). */
export function toProjectSummary(p: {
  id: string;
  title: string;
  kind: string;
  genre: string | null;
  status: string;
  cover: string | null;
}): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    meta: [p.kind, p.genre, p.status].filter(Boolean).join(' · '),
    cover: p.cover,
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
      return status === 'publié';
    default:
      return true; // 'tous'
  }
}

type InviteeRow = { status: string; toUser: { id: string; displayName: string; profile: { creatorRoles: string[] } | null } };

/**
 * CS-1 seam extended for CS-12 ("Mes projets"). The legacy `scope='projects'` path is byte-for-byte
 * the old MC-3/MC-4 picker (single owner-scoped query → bare ProjectSummary). The `scope='all'` path
 * folds the caller's illustration collections (reusing CollectionsService.getMine) into a merged,
 * searchable, status-filtered, paginated dashboard listing with a derived summary.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
  ) {}

  async getMine(accountId: string, query?: ParsedMyProjectsQuery): Promise<MyProjectsResponse> {
    if (!query || query.scope === 'projects') return this.legacyPicker(accountId);
    return this.dashboard(accountId, query);
  }

  // ponytail: unchanged single query — MC-3/MC-4 picker path, tiny owner-scoped list.
  private async legacyPicker(accountId: string): Promise<MyProjectsResponse> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map(toProjectSummary) };
  }

  private async dashboard(accountId: string, query: ParsedMyProjectsQuery): Promise<MyProjectsResponse> {
    const [projects, owner, collections, illustrations] = await Promise.all([
      this.prisma.project.findMany({
        where: { ownerId: accountId },
        include: {
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

    for (const p of projects as unknown as Array<Record<string, unknown> & { invitations: InviteeRow[] }>) {
      const members: ProjectMemberRef[] = [
        ownerRef,
        ...p.invitations
          .filter((inv) => inv.status === 'accepted')
          .map((inv) => ({
          id: inv.toUser.id,
          name: inv.toUser.displayName,
          role: firstRole(inv.toUser.profile?.creatorRoles),
          self: false,
          })),
      ];
      const nextReleaseAt = p['nextReleaseAt'] as Date | null;
      rows.push({
        ...toProjectSummary(p as never),
        slug: (p['slug'] as string | null) ?? null,
        type: p['kind'] as string,
        status: p['status'] as string,
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
}

function firstRole(roles: string[] | undefined | null): CreatorRole | null {
  return (roles?.[0] as CreatorRole | undefined) ?? null;
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
