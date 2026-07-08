import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreatorRole,
  InvitationDirection,
  InvitationDto,
  InvitationsResponse,
  InvitationStatus,
  InvitationUserRef,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConnectionsService } from '../connections/connections.service';
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

type ProjectRow = { id: string; title: string; kind: string; genre: string | null; status: string; cover: string | null } | null;

type InvitationRow = {
  id: string;
  message: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
  fromUserId: string;
  toUserId: string;
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
  ) {}

  async create(fromUserId: string, dto: CreateInvitationDto): Promise<InvitationDto> {
    if (dto.toUser === fromUserId) {
      throw new BadRequestException('Vous ne pouvez pas vous inviter vous-même.');
    }

    const recipient = (await this.prisma.account.findFirst({
      where: { id: dto.toUser, deletedAt: null }, // AD-6 seam: ban flag joins here when it lands
      ...USER_SELECT,
    })) as UserRow | null;
    if (!recipient) throw new NotFoundException('Ce créateur est introuvable.');

    if ((recipient.profile?.creatorRoles?.length ?? 0) === 0) {
      throw new UnprocessableEntityException('Ce créateur ne peut pas recevoir de proposition pour le moment.');
    }

    // message length is capped by the DTO (@MaxLength); default to '' when absent.
    if (dto.projectId) {
      const owned = await this.prisma.project.findFirst({ where: { id: dto.projectId, ownerId: fromUserId } });
      if (!owned) throw new ForbiddenException('Ce projet ne vous appartient pas.');
    }

    // ponytail: service-level duplicate check on (fromUser, toUser) pending — DB partial unique index
    // if invite races ever matter. Key ignores projectId (strictest reading of the story).
    const dupe = await this.prisma.invitation.findFirst({
      where: { fromUserId, toUserId: dto.toUser, status: 'pending' },
    });
    if (dupe) throw new ConflictException('Une proposition est déjà en attente pour ce créateur.');

    const row = (await this.prisma.invitation.create({
      data: {
        fromUserId,
        toUserId: dto.toUser,
        projectId: dto.projectId ?? null,
        message: dto.message ?? '',
      },
      include: INVITATION_INCLUDE,
    })) as InvitationRow;

    await this.notifications.create({
      recipientId: row.toUserId,
      type: 'invitation',
      refId: row.id,
      sourceUserId: fromUserId,
    });

    return toInvitationDto(row);
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

    // MC-8: an accepted invite creates the mutual connection. CS-2 seam: collaboration records
    // (the shared workspace) still land here later.
    if (dto.status === 'accepted') {
      await this.connections.ensureConnected(inv.fromUserId, accountId);
    }

    await this.notifications.create({
      recipientId: inv.fromUserId,
      type: 'invitation',
      refId: inv.id,
      sourceUserId: accountId,
    });

    return toInvitationDto(updated);
  }
}
