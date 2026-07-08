import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ConnectionRequestDto,
  ConnectionRequestItem,
  ConnectionRequestsResponse,
  ConnectionState,
  ConnectionStatus,
  ConnectionSuggestionsResponse,
  ContactItem,
  ContactsResponse,
  CreatorRole,
  PeopleSearchResponse,
} from '@encre-et-plume/shared';
import { resolveGenre, SEARCH_MIN_QUERY_LENGTH } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from './presence.service';
import { MatchesService } from '../matches/matches.service';
import type { CreateConnectionRequestDto } from './dto/create-connection-request.dto';

const LIST_CAP = 200; // ponytail: personal network fits; MC-9-era pagination when it doesn't.
const SEARCH_TAKE = 20;
const SUGGESTIONS_LIMIT = 12;

// Account ref shape for a request's requester (id, name, slug, avatar, role).
const REQUESTER_SELECT = {
  id: true,
  displayName: true,
  profileSlug: true,
  avatar: true,
  profile: { select: { creatorRoles: true } },
} as const;

// Contact select adds city (row meta) on top of the ref shape.
const CONTACT_SELECT = {
  id: true,
  displayName: true,
  profileSlug: true,
  avatar: true,
  profile: { select: { creatorRoles: true, city: true } },
} as const;

interface RefRow {
  id: string;
  displayName: string;
  profileSlug: string;
  avatar: string | null;
  profile: { creatorRoles: string[]; city?: string | null } | null;
}

// D6/F-7 role-label folding: a free-text query term → creatorRoles it matches.
const ROLE_LABELS: { role: CreatorRole; labels: string[] }[] = [
  { role: 'scenariste', labels: ['scenariste', 'scénariste'] },
  { role: 'dessinateur', labels: ['dessinateur', 'dessinateur·rice', 'dessinatrice'] },
];

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function isP2002(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * MC-8 "Contacts & connexions". One Connection table backs both story entities (D3): a `pending` row is
 * a request, an `accepted` row is a mutual connection. All reads/writes are scoped to the session viewer
 * (never a client claim); no-existence-leak 404s follow the MC-7 owner pattern. Presence is delegated to
 * PresenceService (session index), suggestions to MatchesService (MC-2).
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly presence: PresenceService,
    private readonly matches: MatchesService,
  ) {}

  async createRequest(fromId: string, dto: CreateConnectionRequestDto): Promise<ConnectionRequestDto> {
    const toUser = dto.toUser;
    if (toUser === fromId) throw new BadRequestException('Vous ne pouvez pas vous connecter à vous-même.');

    // AD-6 seam: ban flag joins here when it lands. MC-10 seam: blocked-pair check joins here.
    const recipient = await this.prisma.account.findFirst({ where: { id: toUser, deletedAt: null }, select: { id: true } });
    if (!recipient) throw new NotFoundException('Ce membre est introuvable.');

    const existing = await this.prisma.connection.findFirst({ where: this.pairWhere(fromId, toUser) });
    if (existing) {
      if (existing.status === 'accepted') throw new ConflictException('Vous êtes déjà en contact.');
      if (existing.status === 'pending') throw new ConflictException('Une demande est déjà en attente.');
      // declined → reuse the row (keeps one-row-per-pair), set the requesting direction, back to pending.
      const context = await this.composeContext(fromId, toUser);
      const row = await this.prisma.connection.update({
        where: { id: existing.id },
        data: { requesterId: fromId, addresseeId: toUser, status: 'pending', respondedAt: null, context, createdAt: new Date() },
      });
      await this.notifyRequest(row.id, fromId, toUser);
      return { id: row.id, status: row.status as ConnectionStatus };
    }

    const context = await this.composeContext(fromId, toUser);
    let row;
    try {
      row = await this.prisma.connection.create({
        data: { requesterId: fromId, addresseeId: toUser, status: 'pending', context },
      });
    } catch (e) {
      // Race: a concurrent request created the pair first (unique [requesterId, addresseeId]).
      if (isP2002(e)) throw new ConflictException('Une demande est déjà en attente.');
      throw e;
    }
    await this.notifyRequest(row.id, fromId, toUser);
    return { id: row.id, status: row.status as ConnectionStatus };
  }

  async listRequests(viewerId: string): Promise<ConnectionRequestsResponse> {
    const rows = (await this.prisma.connection.findMany({
      where: { addresseeId: viewerId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: LIST_CAP,
      include: { requester: { select: REQUESTER_SELECT } },
    })) as unknown as { id: string; context: string; createdAt: Date; requester: RefRow }[];

    const items: ConnectionRequestItem[] = rows.map((r) => ({
      id: r.id,
      from: {
        userId: r.requester.id,
        slug: r.requester.profileSlug,
        name: r.requester.displayName,
        avatarUrl: r.requester.avatar,
        role: (r.requester.profile?.creatorRoles?.[0] ?? null) as CreatorRole | null,
      },
      context: r.context,
      createdAt: r.createdAt.toISOString(),
    }));
    return { items };
  }

  async decide(viewerId: string, id: string, status: 'accepted' | 'declined'): Promise<ConnectionRequestDto> {
    const row = await this.prisma.connection.findUnique({ where: { id } });
    // 404 on unknown OR not-recipient — no existence leak (MC-7 pattern).
    if (!row || row.addresseeId !== viewerId) throw new NotFoundException('Demande introuvable.');
    if (row.status !== 'pending') throw new ConflictException('Cette demande a déjà été traitée.');

    const updated = await this.prisma.connection.update({ where: { id }, data: { status, respondedAt: new Date() } });

    // F-5: accept notifies the requester; decline is silent (BE-12).
    if (status === 'accepted') {
      await this.notifications.create({
        recipientId: row.requesterId,
        type: 'connection_accepted',
        refId: id,
        sourceUserId: viewerId,
      });
    }
    return { id: updated.id, status: updated.status as ConnectionStatus };
  }

  async listContacts(viewerId: string): Promise<ContactsResponse> {
    // ponytail: unpaginated (take 200) owner-scoped personal list — pagination lands with MC-9.
    const rows = (await this.prisma.connection.findMany({
      where: { status: 'accepted', OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
      take: LIST_CAP,
      include: { requester: { select: CONTACT_SELECT }, addressee: { select: CONTACT_SELECT } },
    })) as unknown as { requesterId: string; addresseeId: string; requester: RefRow; addressee: RefRow }[];

    const others = rows.map((r) => (r.requesterId === viewerId ? r.addressee : r.requester));
    const otherIds = others.map((o) => o.id);

    // mutualProjects for the whole list in one grouped query (fetch viewer's workIds once, no N+1).
    const viewerWorks = await this.prisma.workCreator.findMany({ where: { accountId: viewerId }, select: { workId: true } });
    const viewerWorkIds = viewerWorks.map((w) => w.workId);
    const mutualBy = new Map<string, number>();
    if (viewerWorkIds.length && otherIds.length) {
      const grouped = (await this.prisma.workCreator.groupBy({
        by: ['accountId'],
        where: { accountId: { in: otherIds }, workId: { in: viewerWorkIds } },
        _count: { _all: true },
      })) as unknown as { accountId: string; _count: { _all: number } }[];
      for (const g of grouped) mutualBy.set(g.accountId, g._count._all);
    }

    const presence = await this.presence.get(otherIds);

    const items: ContactItem[] = others.map((o) => ({
      userId: o.id,
      slug: o.profileSlug,
      name: o.displayName,
      avatarUrl: o.avatar,
      role: (o.profile?.creatorRoles?.[0] ?? null) as CreatorRole | null,
      city: o.profile?.city ?? null,
      mutualProjects: mutualBy.get(o.id) ?? 0,
      presence: presence[o.id] ?? { online: false, lastSeen: null },
    }));
    items.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { items };
  }

  async removeContact(viewerId: string, userId: string): Promise<void> {
    const row = await this.prisma.connection.findFirst({
      where: { status: 'accepted', ...this.pairWhere(viewerId, userId) },
    });
    if (!row) throw new NotFoundException('Contact introuvable.');
    await this.prisma.connection.delete({ where: { id: row.id } });
  }

  suggestions(viewerId: string): Promise<ConnectionSuggestionsResponse> {
    return this.matches.getSuggestions(viewerId, SUGGESTIONS_LIMIT);
  }

  async peopleSearch(viewerId: string, q: string): Promise<PeopleSearchResponse> {
    const query = (q ?? '').trim();
    if (query.length < SEARCH_MIN_QUERY_LENGTH) return { items: [] };

    const genreFr = resolveGenre(query);
    const roles = this.matchRoles(query);

    const or: Record<string, unknown>[] = [
      { displayName: { contains: query, mode: 'insensitive' } },
      { profile: { city: { contains: query, mode: 'insensitive' } } },
      { profile: { region: { contains: query, mode: 'insensitive' } } },
    ];
    if (genreFr) or.push({ profile: { tags: { has: genreFr } } });
    if (roles.length) or.push({ profile: { creatorRoles: { hasSome: roles } } });

    const rows = (await this.prisma.account.findMany({
      where: { deletedAt: null, id: { not: viewerId }, OR: or }, // AD-6 seam: ban flag joins here
      orderBy: { displayName: 'asc' },
      take: SEARCH_TAKE,
      select: { id: true, displayName: true, profileSlug: true, avatar: true, profile: { select: { creatorRoles: true, city: true, region: true } } },
    })) as unknown as (RefRow & { profile: { creatorRoles: string[]; city: string | null; region: string | null } | null })[];

    const ids = rows.map((r) => r.id);
    const conns = ids.length
      ? await this.prisma.connection.findMany({
          where: { OR: [{ requesterId: viewerId, addresseeId: { in: ids } }, { addresseeId: viewerId, requesterId: { in: ids } }] },
          select: { requesterId: true, addresseeId: true, status: true },
        })
      : [];

    const stateFor = (id: string): ConnectionState => {
      const c = conns.find((x) => x.requesterId === id || x.addresseeId === id);
      if (!c) return 'none';
      if (c.status === 'accepted') return 'connected';
      if (c.status === 'pending') return c.requesterId === viewerId ? 'pending_out' : 'pending_in';
      return 'none';
    };

    return {
      items: rows.map((r) => ({
        userId: r.id,
        slug: r.profileSlug,
        name: r.displayName,
        avatarUrl: r.avatar,
        role: (r.profile?.creatorRoles?.[0] ?? null) as CreatorRole | null,
        location: r.profile?.city ?? r.profile?.region ?? null,
        connectionState: stateFor(r.id),
      })),
    };
  }

  /**
   * MC-3/MC-7 seam: an accepted collab invite / application creates the mutual connection. Idempotent
   * and silent (the invite/application accept already notified). Never demotes an accepted pair.
   */
  async ensureConnected(a: string, b: string): Promise<void> {
    const existing = await this.prisma.connection.findFirst({ where: this.pairWhere(a, b) });
    if (existing) {
      if (existing.status === 'accepted') return;
      await this.prisma.connection.update({ where: { id: existing.id }, data: { status: 'accepted', respondedAt: new Date() } });
      return;
    }
    try {
      await this.prisma.connection.create({
        data: { requesterId: a, addresseeId: b, status: 'accepted', respondedAt: new Date(), context: '' },
      });
    } catch (e) {
      if (isP2002(e)) return; // race: another path connected them first
      throw e;
    }
  }

  private pairWhere(a: string, b: string) {
    return { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] };
  }

  private matchRoles(q: string): CreatorRole[] {
    const f = fold(q);
    return ROLE_LABELS.filter((r) => r.labels.some((l) => fold(l).includes(f))).map((r) => r.role);
  }

  private notifyRequest(refId: string, fromId: string, toUser: string): Promise<unknown> {
    return this.notifications.create({ recipientId: toUser, type: 'connection_request', refId, sourceUserId: fromId });
  }

  /** D6: French context line frozen at request creation — mutual projects, else likes, else neutral. */
  private async composeContext(fromId: string, toId: string): Promise<string> {
    const fromWorks = await this.prisma.workCreator.findMany({ where: { accountId: fromId }, select: { workId: true } });
    const workIds = fromWorks.map((w) => w.workId);
    const mutual = workIds.length
      ? await this.prisma.workCreator.count({ where: { accountId: toId, workId: { in: workIds } } })
      : 0;
    if (mutual > 0) return `${mutual} ${mutual > 1 ? 'projets' : 'projet'} en commun · souhaite se connecter`;

    const illus = await this.prisma.illustration.findMany({ where: { artistId: toId }, select: { id: true } });
    const illusIds = illus.map((i) => i.id);
    const likes = illusIds.length
      ? await this.prisma.reaction.count({ where: { accountId: fromId, targetType: 'illustration', kind: 'like', targetId: { in: illusIds } } })
      : 0;
    if (likes > 0) return `a aimé ${likes} de vos illustrations`;

    return 'souhaite se connecter';
  }
}
