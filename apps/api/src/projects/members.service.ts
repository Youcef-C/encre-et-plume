import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  GroupMemberDto,
  GroupMembersResponse,
  GroupPermission,
  GroupRole,
  UpdateGroupMemberRequest,
  UpdateRevenueSplitRequest,
} from '@encre-et-plume/shared';
import { GROUP_PERMISSIONS, GROUP_ROLES, effectiveGroupPermissions } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isMemberOf } from './projects.service';

const ROLES = new Set<string>(GROUP_ROLES);
const PERMS = new Set<string>(GROUP_PERMISSIONS);

/**
 * The creator columns EVERY project/page/asset resolver must select.
 *
 * One definition on purpose: B-4 was a `creators: { select: { accountId: true } }` — the permission
 * columns never loaded, so no gate was possible downstream no matter what the route did. Selecting
 * this constant makes that failure mode unrepresentable.
 */
export const GROUP_GATE_SELECT = { accountId: true, groupRole: true, permissions: true } as const;

/** The minimal project shape the exported permission seam needs (a superset of `isMemberOf`'s). */
export type ProjectWithCreators = {
  ownerId: string;
  work: { creators: { accountId: string; groupRole: string; permissions: string[] }[] } | null;
};

/** True when the caller holds `perm` on this project. Owner / leader / co-leader ⇒ always true. */
export function hasGroupPermission(project: ProjectWithCreators, accountId: string, perm: GroupPermission): boolean {
  if (project.ownerId === accountId) return true;
  const row = project.work?.creators.find((c) => c.accountId === accountId);
  if (!row) return false;
  return effectiveGroupPermissions(row).includes(perm);
}

/**
 * The « Écriture » gate for every route that persists project content.
 *
 * Lives here, next to the seam, because it has now been needed by three separate services. Each time it
 * was wired per-route instead, a sibling caller stayed open: the CS-4 gateway had it, the scenario REST
 * routes did not (B-2), and then the CS-3 asset routes did not either (B-4) — a member with the toggle
 * OFF could still version, repoint and permanently delete the very asset B-2 had just protected.
 * Import this; do not re-derive it.
 */
export function assertCanWrite(project: ProjectWithCreators, accountId: string): void {
  if (!hasGroupPermission(project, accountId, 'ecriture')) {
    throw new ForbiddenException("Vous n'avez pas la permission « Écriture » sur ce projet.");
  }
}

/** True for the project owner or a `leader` row (CS-16 project-delete gate). Co-leaders are false. */
export function isGroupLeader(project: ProjectWithCreators, accountId: string): boolean {
  if (project.ownerId === accountId) return true;
  return project.work?.creators.some((c) => c.accountId === accountId && c.groupRole === 'leader') ?? false;
}

/** The minimal shape the manage gate needs — a project row plus its creators' group roles. */
export type ProjectWithGroupRoles = {
  ownerId: string;
  work: { creators: { accountId: string; groupRole: string }[] } | null;
};

/**
 * Leader OR co-leader OR the project owner — the "gérer le groupe" gate (equal leadership).
 *
 * This is the ONE definition of the rule: the CS-10 members routes gate on it, and MC-3's
 * `POST /invitations` project gate consumes it too (B8-R2 — a co-leader must be able to invite
 * from the Groupe page; the old owner-only lookup 403'd exactly the role CS-10 introduces).
 * Exported as a pure function rather than a MembersService method because ProjectsModule already
 * imports InvitationsModule — injecting the service the other way would close a module cycle.
 */
export function canManageProject(project: ProjectWithGroupRoles, accountId: string): boolean {
  if (project.ownerId === accountId) return true;
  const row = project.work?.creators.find((c) => c.accountId === accountId);
  return row?.groupRole === 'leader' || row?.groupRole === 'coleader';
}

type CreatorRow = {
  id: string;
  accountId: string;
  role: string;
  order: number;
  groupRole: string;
  permissions: string[];
  sharePct: number;
  account: { id: string; displayName: string; avatar: string | null; profileSlug: string };
};

type GroupProject = {
  id: string;
  slug: string | null;
  title: string;
  ownerId: string;
  visibility: string;
  workId: string;
  work: { creators: CreatorRow[] } | null;
  invitations: { id: string; toUser: { displayName: string; avatar: string | null } }[];
};

/** Everything the group page reads in one query: creators (+ their account), pending invitations. */
const GROUP_INCLUDE = {
  work: {
    include: {
      creators: {
        orderBy: { order: 'asc' as const },
        include: { account: { select: { id: true, displayName: true, avatar: true, profileSlug: true } } },
      },
    },
  },
  invitations: {
    where: { status: 'pending' as never },
    orderBy: { createdAt: 'asc' as const },
    include: { toUser: { select: { displayName: true, avatar: true } } },
  },
} as const;

/**
 * CS-10 "Gérer le groupe" — group roles, permission toggles, revoke and the revenue split. The model
 * lives on the EXISTING membership row (`WorkCreator.groupRole/permissions/sharePct`); there is no
 * parallel Member entity. Reads are member-gated (a member must see "votre part"); every mutation is
 * leader/co-leader-only, enforced here (never from a client claim). Every mutation returns the whole
 * refreshed group so the FE swaps one state object.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── GET /projects/:slug/members ───────────────────────────────────────────
  async getMembers(accountId: string, slug: string): Promise<GroupMembersResponse> {
    const project = await this.loadBySlug(accountId, slug);
    return toResponse(project, accountId);
  }

  // ── PATCH /members/:id ────────────────────────────────────────────────────
  async updateMember(accountId: string, memberId: string, dto: UpdateGroupMemberRequest): Promise<GroupMembersResponse> {
    const { project, row } = await this.loadMemberRow(memberId);
    this.assertCanManage(project, accountId);

    const data: { groupRole?: string; permissions?: string[] } = {};

    if (dto.permissions !== undefined) {
      if (!Array.isArray(dto.permissions) || dto.permissions.some((p) => !PERMS.has(p))) {
        throw new BadRequestException('Permission invalide.');
      }
      data.permissions = [...new Set(dto.permissions)];
    }

    if (dto.groupRole !== undefined) {
      if (!ROLES.has(dto.groupRole)) throw new BadRequestException('Statut de groupe invalide.');
      // Granting OR removing the `leader` status is a leader-only (or owner) decision.
      if ((dto.groupRole === 'leader' || row.groupRole === 'leader') && !isGroupLeader(project, accountId)) {
        throw new ForbiddenException('Seul·e un·e chef·fe de groupe peut modifier le statut de chef·fe.');
      }
      if (row.groupRole === 'leader' && dto.groupRole !== 'leader' && this.leaderCountWithout(project, row.id) === 0) {
        throw new BadRequestException('Le groupe doit garder au moins un·e chef·fe de groupe.');
      }
      data.groupRole = dto.groupRole;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.workCreator.update({ where: { id: memberId }, data });
    }
    return this.refresh(project, accountId);
  }

  // ── DELETE /members/:id — revoke ──────────────────────────────────────────
  async revokeMember(accountId: string, memberId: string): Promise<GroupMembersResponse> {
    const { project, row } = await this.loadMemberRow(memberId);
    this.assertCanManage(project, accountId);

    if (row.accountId === project.ownerId) {
      throw new BadRequestException('Le·la propriétaire du projet ne peut pas être révoqué·e.');
    }
    if (row.groupRole === 'leader' && !isGroupLeader(project, accountId)) {
      throw new ForbiddenException('Seul·e un·e chef·fe de groupe peut modifier le statut de chef·fe.');
    }
    if (row.groupRole === 'leader' && this.leaderCountWithout(project, row.id) === 0) {
      throw new BadRequestException('Le groupe doit garder au moins un·e chef·fe de groupe.');
    }

    // The "sum = 100" invariant must survive every membership change: the revoked share goes back to
    // the owner's row (new members always join at 0 %).
    const ownerRow = project.work?.creators.find((c) => c.accountId === project.ownerId);
    await this.prisma.$transaction(async (tx) => {
      await tx.workCreator.delete({ where: { id: memberId } });
      if (ownerRow && row.sharePct > 0) {
        // N2: atomic increment — a precomputed `ownerRow.sharePct + row.sharePct` read from the
        // pre-transaction snapshot loses one transfer when two revokes race (sum ≠ 100).
        await tx.workCreator.update({ where: { id: ownerRow.id }, data: { sharePct: { increment: row.sharePct } } });
      }
    });

    // F-5 side effect — best-effort, never fails the revoke.
    try {
      await this.notifications.create({
        recipientId: row.accountId,
        type: 'project_activity',
        refId: project.id,
        sourceUserId: accountId,
        message: `Vous avez été retiré·e du groupe « ${project.title} »`,
      });
    } catch (e) {
      this.logger.error(`CS-10 revoke notification failed for ${row.accountId}: ${(e as Error).message}`);
    }

    return this.refresh(project, accountId);
  }

  // ── PATCH /projects/:slug/revenue-split ───────────────────────────────────
  async updateRevenueSplit(accountId: string, slug: string, dto: UpdateRevenueSplitRequest): Promise<GroupMembersResponse> {
    const project = await this.loadBySlug(accountId, slug);
    this.assertCanManage(project, accountId);

    const shares = dto.shares ?? [];
    for (const s of shares) {
      if (!Number.isInteger(s.pct) || s.pct < 0 || s.pct > 100) throw new BadRequestException('Part invalide (0 à 100).');
    }
    if (shares.reduce((sum, s) => sum + s.pct, 0) !== 100) {
      throw new BadRequestException('Le total des parts doit faire 100 %.');
    }

    // N3: the member set is re-read INSIDE the transaction so validation and writes see one
    // snapshot. Reading it from the pre-transaction load let a concurrent revoke slip in between
    // and turned a `workCreator.update` into a raw Prisma P2025 → 500 instead of the French 400.
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.workCreator.findMany({ where: { workId: project.workId }, select: { id: true } });
        const memberIds = new Set(rows.map((r) => r.id));
        const sent = new Set(shares.map((s) => s.memberId));
        if (shares.length !== memberIds.size || [...memberIds].some((id) => !sent.has(id))) {
          throw new BadRequestException('Chaque membre du groupe doit avoir une part.');
        }
        for (const s of shares) {
          await tx.workCreator.update({ where: { id: s.memberId }, data: { sharePct: s.pct } });
        }
      });
    } catch (e) {
      // Belt and braces: any row that still vanished under the transaction stays a French 400.
      if ((e as { code?: string }).code === 'P2025') throw new BadRequestException('Membre introuvable');
      throw e;
    }
    return this.refresh(project, accountId);
  }

  /**
   * Every accountId with leadership (leader OR co-leader) on a project.
   *
   * MC-3 Mode B seam — a `join` collab proposal is **established only when every one of these accounts
   * accepts** (unanimity); a single decline closes the proposal. CS-10 ships the seam only; the join
   * flow itself lands with the MC-3 Mode B follow-up.
   */
  async getGroupLeaders(projectId: string): Promise<string[]> {
    const project = (await this.prisma.project.findFirst({
      where: { id: projectId },
      include: GROUP_INCLUDE,
    })) as unknown as GroupProject | null;
    if (!project) return [];
    return (project.work?.creators ?? [])
      .filter((c) => c.groupRole === 'leader' || c.groupRole === 'coleader')
      .map((c) => c.accountId);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Same 404/403 matrix as the workspace read: unknown → 404, non-member public → 403, private → 404. */
  private async loadBySlug(accountId: string, slug: string): Promise<GroupProject> {
    const project = (await this.prisma.project.findUnique({
      where: { slug },
      include: GROUP_INCLUDE,
    })) as unknown as GroupProject | null;
    if (!project) throw new NotFoundException('Projet introuvable');
    if (!isMemberOf(project as never, accountId)) {
      if (project.visibility === 'public') throw new ForbiddenException('Réservé aux membres du projet');
      throw new NotFoundException('Projet introuvable');
    }
    return project;
  }

  /** `:id` is a WorkCreator id → resolve its Work's Project. A row with no project → 404. */
  private async loadMemberRow(memberId: string): Promise<{ project: GroupProject; row: CreatorRow }> {
    const ref = await this.prisma.workCreator.findUnique({ where: { id: memberId }, select: { workId: true } });
    if (!ref) throw new NotFoundException('Membre introuvable');
    const project = (await this.prisma.project.findFirst({
      where: { workId: ref.workId },
      include: GROUP_INCLUDE,
    })) as unknown as GroupProject | null;
    const row = project?.work?.creators.find((c) => c.id === memberId);
    if (!project || !row) throw new NotFoundException('Membre introuvable');
    return { project, row };
  }

  private assertCanManage(project: GroupProject, accountId: string): void {
    if (!canManageProject(project as never, accountId)) throw new ForbiddenException('Réservé aux chef·fes de groupe.');
  }

  private leaderCountWithout(project: GroupProject, memberId: string): number {
    return (project.work?.creators ?? []).filter((c) => c.id !== memberId && c.groupRole === 'leader').length;
  }

  /** Re-read the group after a write so the FE swaps one authoritative state object. */
  private async refresh(project: GroupProject, accountId: string): Promise<GroupMembersResponse> {
    const fresh = (await this.prisma.project.findFirst({
      where: { id: project.id },
      include: GROUP_INCLUDE,
    })) as unknown as GroupProject | null;
    return toResponse(fresh ?? project, accountId);
  }
}

/** Owner row first, then WorkCreator.order asc (the prototype's member ordering). */
function orderedCreators(project: GroupProject): CreatorRow[] {
  const rows = [...(project.work?.creators ?? [])];
  rows.sort((a, b) => {
    const ao = a.accountId === project.ownerId ? -1 : 0;
    const bo = b.accountId === project.ownerId ? -1 : 0;
    return ao - bo || a.order - b.order;
  });
  return rows;
}

function toMemberDto(row: CreatorRow, ownerId: string): GroupMemberDto {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.account.displayName,
    slug: row.account.profileSlug ?? null,
    avatar: row.account.avatar,
    creatorRole: row.role,
    isOwner: row.accountId === ownerId,
    groupRole: row.groupRole as GroupRole,
    permissions: (row.permissions ?? []).filter((p): p is GroupPermission => PERMS.has(p)),
    effectivePermissions: effectiveGroupPermissions(row),
    sharePct: row.sharePct,
  };
}

function toResponse(project: GroupProject, accountId: string): GroupMembersResponse {
  const rows = orderedCreators(project);
  const members = rows.map((r) => toMemberDto(r, project.ownerId));
  const self = rows.find((r) => r.accountId === accountId);
  const isOwner = project.ownerId === accountId;
  return {
    projectId: project.id,
    projectTitle: project.title,
    members,
    pending: (project.invitations ?? []).map((i) => ({
      invitationId: i.id,
      name: i.toUser.displayName,
      avatar: i.toUser.avatar,
    })),
    viewer: {
      memberId: self?.id ?? null,
      groupRole: (self?.groupRole as GroupRole | undefined) ?? null,
      canManage: canManageProject(project as never, accountId),
      isLeader: isOwner || self?.groupRole === 'leader',
    },
    splitTotal: members.reduce((sum, m) => sum + m.sharePct, 0),
  };
}
