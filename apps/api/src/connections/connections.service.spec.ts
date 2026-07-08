import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PresenceService } from './presence.service';
import type { MatchesService } from '../matches/matches.service';
import type { BlocksService } from '../blocks/blocks.service';

const accountRef = (id: string, roles: string[] = ['scenariste']) => ({
  id,
  displayName: `Name ${id}`,
  profileSlug: `slug-${id}`,
  avatar: null,
  profile: { creatorRoles: roles, city: 'Paris', region: 'Île-de-France' },
});

const CONN = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'conn-1',
  requesterId: 'acc-from',
  addresseeId: 'acc-to',
  status: 'pending',
  context: 'souhaite se connecter',
  createdAt: new Date('2026-07-07T10:00:00.000Z'),
  respondedAt: null,
  ...o,
});

function makePrisma() {
  return {
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-to', deletedAt: null }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    connection: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(CONN()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(CONN()),
      update: jest.fn().mockResolvedValue(CONN({ status: 'accepted' })),
      delete: jest.fn().mockResolvedValue(CONN()),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    workCreator: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    illustration: { findMany: jest.fn().mockResolvedValue([]) },
    reaction: { count: jest.fn().mockResolvedValue(0) },
  };
}

function build(prisma: ReturnType<typeof makePrisma>, over: Partial<{
  notifications: { create: jest.Mock };
  presence: { get: jest.Mock };
  matches: { getSuggestions: jest.Mock };
  blocks: { isBlockedPair: jest.Mock };
}> = {}) {
  const notifications = over.notifications ?? { create: jest.fn().mockResolvedValue(null) };
  const presence = over.presence ?? { get: jest.fn().mockResolvedValue({}) };
  const matches = over.matches ?? { getSuggestions: jest.fn().mockResolvedValue({ items: [], incompleteProfile: false }) };
  const blocks = over.blocks ?? { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new ConnectionsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    presence as unknown as PresenceService,
    matches as unknown as MatchesService,
    blocks as unknown as BlocksService,
  );
  return { service, notifications, presence, matches, blocks };
}

describe('ConnectionsService.createRequest', () => {
  it('rejects a self-request with 400', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);
    await expect(service.createRequest('acc-a', { toUser: 'acc-a' })).rejects.toThrow(BadRequestException);
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('404s an unknown or deleted target', async () => {
    const prisma = makePrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const { service } = build(prisma);
    await expect(service.createRequest('acc-from', { toUser: 'ghost' })).rejects.toThrow(NotFoundException);
    // AD-6 seam: existence gate filters deletedAt: null
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'ghost', deletedAt: null }) }),
    );
  });

  it('MC-10: 404s a blocked pair with the same no-existence-leak wording', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma, { blocks: { isBlockedPair: jest.fn().mockResolvedValue(true) } });
    await expect(service.createRequest('acc-from', { toUser: 'acc-to' })).rejects.toThrow(
      'Ce membre est introuvable.',
    );
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('409s when a pending request already exists in either direction', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ status: 'pending' }));
    const { service } = build(prisma);
    await expect(service.createRequest('acc-from', { toUser: 'acc-to' })).rejects.toThrow(ConflictException);
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('409s when the pair is already connected', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ status: 'accepted' }));
    const { service } = build(prisma);
    await expect(service.createRequest('acc-from', { toUser: 'acc-to' })).rejects.toThrow(ConflictException);
  });

  it('reuses a declined row (new direction, back to pending) instead of creating a second row', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ id: 'old', status: 'declined', requesterId: 'acc-to', addresseeId: 'acc-from' }));
    prisma.connection.update.mockResolvedValue(CONN({ id: 'old', status: 'pending' }));
    const { service } = build(prisma);
    const res = await service.createRequest('acc-from', { toUser: 'acc-to' });
    expect(prisma.connection.create).not.toHaveBeenCalled();
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old' },
        data: expect.objectContaining({ requesterId: 'acc-from', addresseeId: 'acc-to', status: 'pending', respondedAt: null }),
      }),
    );
    expect(res).toEqual({ id: 'old', status: 'pending' });
  });

  it('creates a pending request, freezes the context and notifies the recipient (connection_request)', async () => {
    const prisma = makePrisma();
    prisma.connection.create.mockResolvedValue(CONN({ id: 'new', status: 'pending' }));
    const { service, notifications } = build(prisma);
    const res = await service.createRequest('acc-from', { toUser: 'acc-to' });
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requesterId: 'acc-from', addresseeId: 'acc-to', status: 'pending' }) }),
    );
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'acc-to',
      type: 'connection_request',
      refId: 'new',
      sourceUserId: 'acc-from',
    });
    expect(res).toEqual({ id: 'new', status: 'pending' });
  });

  describe('context composition (D6)', () => {
    it('names mutual projects (plural) when the pair co-credits works', async () => {
      const prisma = makePrisma();
      prisma.workCreator.findMany.mockResolvedValue([{ workId: 'w1' }, { workId: 'w2' }]);
      prisma.workCreator.count.mockResolvedValue(2);
      const { service } = build(prisma);
      await service.createRequest('acc-from', { toUser: 'acc-to' });
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ context: '2 projets en commun · souhaite se connecter' }) }),
      );
    });

    it('names a single mutual project in the singular', async () => {
      const prisma = makePrisma();
      prisma.workCreator.findMany.mockResolvedValue([{ workId: 'w1' }]);
      prisma.workCreator.count.mockResolvedValue(1);
      const { service } = build(prisma);
      await service.createRequest('acc-from', { toUser: 'acc-to' });
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ context: '1 projet en commun · souhaite se connecter' }) }),
      );
    });

    it("falls back to the likes signal when there are no mutual projects", async () => {
      const prisma = makePrisma();
      prisma.illustration.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]);
      prisma.reaction.count.mockResolvedValue(3);
      const { service } = build(prisma);
      await service.createRequest('acc-from', { toUser: 'acc-to' });
      expect(prisma.reaction.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ accountId: 'acc-from', targetType: 'illustration', kind: 'like' }) }),
      );
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ context: 'a aimé 3 de vos illustrations' }) }),
      );
    });

    it('falls back to the neutral line with no shared signal', async () => {
      const prisma = makePrisma();
      const { service } = build(prisma);
      await service.createRequest('acc-from', { toUser: 'acc-to' });
      expect(prisma.connection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ context: 'souhaite se connecter' }) }),
      );
    });
  });
});

describe('ConnectionsService.decide', () => {
  it('404s an unknown request (no leak)', async () => {
    const prisma = makePrisma();
    prisma.connection.findUnique.mockResolvedValue(null);
    const { service } = build(prisma);
    await expect(service.decide('acc-to', 'nope', 'accepted')).rejects.toThrow(NotFoundException);
    expect(prisma.connection.update).not.toHaveBeenCalled();
  });

  it('404s when the caller is not the addressee (no existence leak)', async () => {
    const prisma = makePrisma();
    prisma.connection.findUnique.mockResolvedValue(CONN({ addresseeId: 'someone-else' }));
    const { service } = build(prisma);
    await expect(service.decide('acc-to', 'conn-1', 'accepted')).rejects.toThrow(NotFoundException);
    expect(prisma.connection.update).not.toHaveBeenCalled();
  });

  it('409s a request that is no longer pending', async () => {
    const prisma = makePrisma();
    prisma.connection.findUnique.mockResolvedValue(CONN({ status: 'accepted' }));
    const { service } = build(prisma);
    await expect(service.decide('acc-to', 'conn-1', 'accepted')).rejects.toThrow(ConflictException);
  });

  it('accepts: sets status + respondedAt and notifies the requester (connection_accepted)', async () => {
    const prisma = makePrisma();
    prisma.connection.update.mockResolvedValue(CONN({ status: 'accepted' }));
    const { service, notifications } = build(prisma);
    const res = await service.decide('acc-to', 'conn-1', 'accepted');
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conn-1' }, data: expect.objectContaining({ status: 'accepted', respondedAt: expect.any(Date) }) }),
    );
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'acc-from',
      type: 'connection_accepted',
      refId: 'conn-1',
      sourceUserId: 'acc-to',
    });
    expect(res).toEqual({ id: 'conn-1', status: 'accepted' });
  });

  it('declines: sets status but sends NO notification', async () => {
    const prisma = makePrisma();
    prisma.connection.update.mockResolvedValue(CONN({ status: 'declined' }));
    const { service, notifications } = build(prisma);
    await service.decide('acc-to', 'conn-1', 'declined');
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'declined' }) }),
    );
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('ConnectionsService.listContacts', () => {
  it('maps the OTHER party in both directions, embeds presence and mutual-project counts', async () => {
    const prisma = makePrisma();
    prisma.connection.findMany.mockResolvedValue([
      { requesterId: 'viewer', addresseeId: 'acc-x', requester: accountRef('viewer'), addressee: accountRef('acc-x', ['dessinateur']) },
      { requesterId: 'acc-y', addresseeId: 'viewer', requester: accountRef('acc-y'), addressee: accountRef('viewer') },
    ]);
    prisma.workCreator.findMany.mockResolvedValue([{ workId: 'w1' }]);
    prisma.workCreator.groupBy.mockResolvedValue([{ accountId: 'acc-x', _count: { _all: 2 } }]);
    const presence = { get: jest.fn().mockResolvedValue({ 'acc-x': { online: true, lastSeen: 't' }, 'acc-y': { online: false, lastSeen: null } }) };
    const { service } = build(prisma, { presence });
    const res = await service.listContacts('viewer');
    const byId = Object.fromEntries(res.items.map((i) => [i.userId, i]));
    expect(byId['acc-x']).toMatchObject({ userId: 'acc-x', role: 'dessinateur', mutualProjects: 2, presence: { online: true, lastSeen: 't' } });
    expect(byId['acc-y']).toMatchObject({ userId: 'acc-y', mutualProjects: 0, presence: { online: false, lastSeen: null } });
    expect(presence.get).toHaveBeenCalledWith(['acc-x', 'acc-y']);
  });

  it('queries only accepted connections in either direction with a cap', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);
    await service.listContacts('viewer');
    const args = prisma.connection.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('accepted');
    expect(args.where.OR).toEqual([{ requesterId: 'viewer' }, { addresseeId: 'viewer' }]);
    expect(args.take).toBe(200);
  });
});

describe('ConnectionsService.removeContact', () => {
  it('404s when there is no accepted connection with the user', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(null);
    const { service } = build(prisma);
    await expect(service.removeContact('viewer', 'acc-x')).rejects.toThrow(NotFoundException);
    expect(prisma.connection.delete).not.toHaveBeenCalled();
  });

  it('deletes the accepted connection row', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ id: 'c9', status: 'accepted' }));
    const { service } = build(prisma);
    await service.removeContact('viewer', 'acc-x');
    expect(prisma.connection.delete).toHaveBeenCalledWith({ where: { id: 'c9' } });
  });
});

describe('ConnectionsService.ensureConnected (MC-3/MC-7 seam)', () => {
  it('creates an accepted row when none exists, without notifying', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(null);
    const { service, notifications } = build(prisma);
    await service.ensureConnected('acc-a', 'acc-b');
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requesterId: 'acc-a', addresseeId: 'acc-b', status: 'accepted' }) }),
    );
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('promotes a pending row to accepted', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ id: 'p', status: 'pending' }));
    const { service } = build(prisma);
    await service.ensureConnected('acc-a', 'acc-b');
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p' }, data: expect.objectContaining({ status: 'accepted' }) }),
    );
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('promotes a declined row to accepted', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ id: 'd', status: 'declined' }));
    const { service } = build(prisma);
    await service.ensureConnected('acc-a', 'acc-b');
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd' }, data: expect.objectContaining({ status: 'accepted' }) }),
    );
  });

  it('is a no-op when the pair is already accepted', async () => {
    const prisma = makePrisma();
    prisma.connection.findFirst.mockResolvedValue(CONN({ status: 'accepted' }));
    const { service } = build(prisma);
    await service.ensureConnected('acc-a', 'acc-b');
    expect(prisma.connection.update).not.toHaveBeenCalled();
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });
});

describe('ConnectionsService.peopleSearch', () => {
  it('returns an empty list below the minimum query length', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);
    expect(await service.peopleSearch('viewer', 'a')).toEqual({ items: [] });
    expect(prisma.account.findMany).not.toHaveBeenCalled();
  });

  it('excludes self and deleted accounts and searches name/city/region', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);
    await service.peopleSearch('viewer', 'lyon');
    const args = prisma.account.findMany.mock.calls[0][0];
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.id).toEqual({ not: 'viewer' });
    expect(args.take).toBe(20);
    const ors = JSON.stringify(args.where.OR);
    expect(ors).toContain('displayName');
    expect(ors).toContain('city');
    expect(ors).toContain('region');
  });

  it('resolves a role term to a creatorRoles filter', async () => {
    const prisma = makePrisma();
    const { service } = build(prisma);
    await service.peopleSearch('viewer', 'scénariste');
    const or = prisma.account.findMany.mock.calls[0][0].where.OR;
    const roleBranch = or.find((b: Record<string, unknown>) => JSON.stringify(b).includes('creatorRoles'));
    expect(roleBranch).toBeTruthy();
    expect(JSON.stringify(roleBranch)).toContain('scenariste');
  });

  it('stamps connectionState per result (pending_out / pending_in / connected / none)', async () => {
    const prisma = makePrisma();
    prisma.account.findMany.mockResolvedValue([
      accountRef('r-out'), accountRef('r-in'), accountRef('r-conn'), accountRef('r-none'),
    ]);
    prisma.connection.findMany.mockResolvedValue([
      { requesterId: 'viewer', addresseeId: 'r-out', status: 'pending' },
      { requesterId: 'r-in', addresseeId: 'viewer', status: 'pending' },
      { requesterId: 'viewer', addresseeId: 'r-conn', status: 'accepted' },
    ]);
    const { service } = build(prisma);
    const res = await service.peopleSearch('viewer', 'name');
    const state = Object.fromEntries(res.items.map((i) => [i.userId, i.connectionState]));
    expect(state).toEqual({ 'r-out': 'pending_out', 'r-in': 'pending_in', 'r-conn': 'connected', 'r-none': 'none' });
  });
});

describe('ConnectionsService.suggestions', () => {
  it('delegates to MatchesService with a limit of 12', async () => {
    const prisma = makePrisma();
    const matches = { getSuggestions: jest.fn().mockResolvedValue({ items: [{ userId: 'x' }], incompleteProfile: false }) };
    const { service } = build(prisma, { matches });
    const res = await service.suggestions('viewer');
    expect(matches.getSuggestions).toHaveBeenCalledWith('viewer', 12);
    expect(res).toEqual({ items: [{ userId: 'x' }], incompleteProfile: false });
  });
});

describe('ConnectionsService.listRequests', () => {
  it('returns incoming pending requests newest-first with the frozen context line', async () => {
    const prisma = makePrisma();
    prisma.connection.findMany.mockResolvedValue([
      { id: 'req-1', context: '2 projets en commun · souhaite se connecter', createdAt: new Date('2026-07-07T10:00:00.000Z'), requester: accountRef('acc-from', ['scenariste']) },
    ]);
    const { service } = build(prisma);
    const res = await service.listRequests('viewer');
    const args = prisma.connection.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ addresseeId: 'viewer', status: 'pending' });
    expect(res.items[0]).toEqual({
      id: 'req-1',
      from: { userId: 'acc-from', slug: 'slug-acc-from', name: 'Name acc-from', avatarUrl: null, role: 'scenariste' },
      context: '2 projets en commun · souhaite se connecter',
      createdAt: '2026-07-07T10:00:00.000Z',
    });
  });

  it('returns OUTGOING pending requests mapped to the addressee when direction=outgoing', async () => {
    const prisma = makePrisma();
    prisma.connection.findMany.mockResolvedValue([
      { id: 'req-2', context: 'souhaite se connecter', createdAt: new Date('2026-07-07T11:00:00.000Z'), addressee: accountRef('acc-to', ['dessinateur']) },
    ]);
    const { service } = build(prisma);
    const res = await service.listRequests('viewer', 'outgoing');
    const args = prisma.connection.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ requesterId: 'viewer', status: 'pending' });
    expect(args.include).toEqual({ addressee: { select: expect.anything() } });
    expect(res.items[0]).toEqual({
      id: 'req-2',
      from: { userId: 'acc-to', slug: 'slug-acc-to', name: 'Name acc-to', avatarUrl: null, role: 'dessinateur' },
      context: 'souhaite se connecter',
      createdAt: '2026-07-07T11:00:00.000Z',
    });
  });
});
