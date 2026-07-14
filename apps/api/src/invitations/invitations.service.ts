import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateInvitationsResponse,
  CreatorRole,
  InvitationDirection,
  InvitationDto,
  InvitationSendResult,
  InvitationsResponse,
  InvitationStatus,
  InvitationUserRef,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConnectionsService } from '../connections/connections.service';
import { BlocksService } from '../blocks/blocks.service';
import { toProjectSummary } from '../projects/projects.service';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type { RespondInvitationDto } from './dto/respond-invitation.dto';

// Account fields needed to build an InvitationUserRef + gate the recipient.
const USER_SELECT = {
  select: {
    id: true,
    displayName: true,
    profileSlug: true,
    avatar: true,
    profile: { select: { creatorRoles: true } },
  },
};

const INVITATION_INCLUDE = {
  fromUser: USER_SELECT,
  toUser: USER_SELECT,
  project: true,
};

type UserRow = {
  id: string;
  displayName: string;
  profileSlug: string;
  avatar: string | null;
  profile: { creatorRoles: string[] } | null;
};

type ProjectRow = { id: string; title: string; kind: string; genre: string | null; status: string; cover: string | null; slug: string | null } | null;

type InvitationRow = {
  id: string;
  message: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  fromUserId: string;
  toUserId: string;
  projectId: string | null;
  fromUser: UserRow;
  toUser: UserRow;
  project: ProjectRow;
};

function toUserRef(u: UserRow): InvitationUserRef {
  return {
    userId: u.id,
    name: u.displayName,
    slug: u.profileSlug,
    avatarUrl: u.avatar,
    role: (u.profile?.creatorRoles?.[0] ?? null) as CreatorRole | null,
  };
}

function toInvitationDto(row: InvitationRow): InvitationDto {
  return {
    id: row.id,
    from: toUserRef(row.fromUser),
    to: toUserRef(row.toUser),
    project: row.project ? toProjectSummary(row.project) : null,
    message: row.message,
    status: row.status as InvitationStatus,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

/**
 * MC-3 "Proposer une collab". Validates recipient eligibility, self-invite, project ownership and
 * duplicate-pending at the trust boundary (never trusts client role claims); persists an Invitation
 * and emits an F-5 notification. Accept/decline notifies the sender.
 *
 * Seams (see plan §1): AD-6 bans not built — "active" = deletedAt-null recipient (a banned recipient
 * will also fail the creator-role gate once AD-6 lands, a banned sender is blocked at session level).
 * CS-2/MC-8 collaboration/connection creation on accept is deferred — the persisted Invitation is
 * their input.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly connections: ConnectionsService,
    private readonly blocks: BlocksService,
  ) {}

  /**
   * Mode A fan-out: one independent Invitation per recipient. Request-level failures (empty
   * selection, unowned project) throw and fail the whole batch; per-recipient failures (self,
   * unavailable, duplicate) become result statuses so the rest of the batch still sends. Always
   * returns the { results } envelope (single recipient included). Mode B (kind:'join') is rejected
   * at the DTO — deferred to the CS-10 follow-up.
   */
  async create(fromUserId: string, dto: CreateInvitationDto): Promise<CreateInvitationsResponse> {
    // Normalize: prefer the multi-recipient field; legacy single-recipient sugar folds into it.
    const requested = dto.toUsers ?? (dto.toUser ? [dto.toUser] : []);
    const recipients = [...new Set(requested)];
    if (recipients.length === 0) {
      throw new BadRequestException('Sélectionnez au moins un·e destinataire.');
    }

    // Request-level: project ownership checked ONCE before the loop (message capped by the DTO).
    if (dto.projectId) {
      const owned = await this.prisma.project.findFirst({ where: { id: dto.projectId, ownerId: fromUserId } });
      if (!owned) throw new ForbiddenException('Ce projet ne vous appartient pas.');
    }

    // ponytail: N≤20 loop, batch the lookups if the cap ever grows.
    const results: InvitationSendResult[] = [];
    for (const toUser of recipients) {
      results.push(await this.sendOne(fromUserId, toUser, dto.projectId, dto.message));
    }
    return { results };
  }

  /** One recipient's outcome — converts the round-1 throws into per-recipient result statuses. */
  private async sendOne(
    fromUserId: string,
    toUser: string,
    projectId: string | undefined,
    message: string | undefined,
  ): Promise<InvitationSendResult> {
    if (toUser === fromUserId) return { toUser, status: 'self', invitation: null };

    const recipient = (await this.prisma.account.findFirst({
      where: { id: toUser, deletedAt: null }, // AD-6 seam: ban flag joins here when it lands
      ...USER_SELECT,
    })) as UserRow | null;
    // MC-10: a blocked pair is indistinguishable from unknown (no block disclosure). No creator
    // roles → cannot receive a proposal. Both collapse to 'unavailable'.
    if (!recipient || (await this.blocks.isBlockedPair(fromUserId, toUser))) {
      return { toUser, status: 'unavailable', invitation: null };
    }
    if ((recipient.profile?.creatorRoles?.length ?? 0) === 0) {
      return { toUser, status: 'unavailable', invitation: null };
    }

    // ponytail: service-level duplicate check on (fromUser, toUser) pending — DB partial unique
    // index if invite races ever matter. Key ignores projectId (strictest reading of the story).
    const dupe = await this.prisma.invitation.findFirst({
      where: { fromUserId, toUserId: toUser, status: 'pending' },
    });
    if (dupe) return { toUser, status: 'duplicate', invitation: null };

    const row = (await this.prisma.invitation.create({
      data: {
        fromUserId,
        toUserId: toUser,
        projectId: projectId ?? null,
        message: message ?? '',
      },
      include: INVITATION_INCLUDE,
    })) as InvitationRow;

    await this.notifications.create({
      recipientId: row.toUserId,
      type: 'invitation',
      refId: row.id,
      sourceUserId: fromUserId,
    });

    return { toUser, status: 'sent', invitation: toInvitationDto(row) };
  }

  async list(
    accountId: string,
    direction: InvitationDirection,
    page: number,
    pageSize: number,
  ): Promise<InvitationsResponse> {
    const where = direction === 'sent' ? { fromUserId: accountId } : { toUserId: accountId };
    const [rows, total] = await Promise.all([
      this.prisma.invitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: INVITATION_INCLUDE,
      }) as Promise<InvitationRow[]>,
      this.prisma.invitation.count({ where }),
    ]);
    return { items: rows.map(toInvitationDto), page, pageSize, total };
  }

  async respond(accountId: string, id: string, dto: RespondInvitationDto): Promise<InvitationDto> {
    const inv = (await this.prisma.invitation.findUnique({
      where: { id },
      include: INVITATION_INCLUDE,
    })) as InvitationRow | null;
    if (!inv) throw new NotFoundException('Invitation introuvable.');
    if (inv.toUserId !== accountId) {
      throw new ForbiddenException('Seul le destinataire peut répondre à cette invitation.');
    }
    if (inv.status !== 'pending') {
      throw new ConflictException('Cette invitation a déjà reçu une réponse.');
    }

    const updated = (await this.prisma.invitation.update({
      where: { id },
      data: { status: dto.status, respondedAt: new Date() },
      include: INVITATION_INCLUDE,
    })) as InvitationRow;

    // MC-8: an accepted invite creates the mutual connection AND, for a project invite, grants the
    // accepter workspace membership (a WorkCreator row on the project's Work) so /projet/{slug} and the
    // kanban open for them. Decline does neither.
    if (dto.status === 'accepted') {
      await this.connections.ensureConnected(inv.fromUserId, accountId);
      if (inv.projectId) {
        await this.addProjectMembership(inv.projectId, accountId, inv.toUser.profile?.creatorRoles);
      }
    }

    // The sender's response notification must NOT read like an invite (bug): a message override makes
    // it render "X a accepté/décliné votre invitation à collaborer" (FE prefers Notification.message).
    const accepterName = inv.toUser.displayName;
    const verb = dto.status === 'accepted' ? 'accepté' : 'décliné';
    await this.notifications.create({
      recipientId: inv.fromUserId,
      type: 'invitation',
      refId: inv.id,
      sourceUserId: accountId,
      message: `${accepterName} a ${verb} votre invitation à collaborer`,
    });

    return toInvitationDto(updated);
  }

  /**
   * Grant the accepter workspace membership on a project invite: a WorkCreator row on the project's
   * linked Work. Idempotent (skips if already a member) and a no-op when the project/work is gone.
   * ponytail: findFirst+count+create isn't a single tx — the @@unique([workId,accountId]) index is the
   * real guard against duplicates; add a tx if concurrent double-accepts ever surface.
   */
  private async addProjectMembership(
    projectId: string,
    accountId: string,
    creatorRoles: string[] | null | undefined,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { workId: true } });
    if (!project?.workId) return; // project or its seeded Work is gone — nothing to join
    const workId = project.workId;

    const existing = await this.prisma.workCreator.findFirst({ where: { workId, accountId } });
    if (existing) return; // already a member — idempotent

    const order = await this.prisma.workCreator.count({ where: { workId } });
    const role = creatorRoles?.find((r) => r === 'scenariste' || r === 'dessinateur') ?? 'scenariste';
    await this.prisma.workCreator.create({ data: { workId, accountId, role, order } });
  }
}
