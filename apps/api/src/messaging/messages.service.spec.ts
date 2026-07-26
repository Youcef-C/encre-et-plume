import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { QueueService } from '../queue/queue.service';
import type { PresenceService } from '../connections/presence.service';
import type { MessagingGateway } from './messaging.gateway';
import type { BlocksService } from '../blocks/blocks.service';
import type { ConnectionsService } from '../connections/connections.service';

const ACC = (id: string) => ({
  id,
  displayName: `Name ${id}`,
  profileSlug: `slug-${id}`,
  avatar: null,
});

// A conversation with two participants (me = acc-1, other = acc-2), no messages yet.
function CONV(over: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    type: 'dm',
    name: null,
    projectId: null,
    dmKey: 'acc-1:acc-2',
    status: 'open',
    requestedBy: null,
    createdAt: new Date('2026-07-07T10:00:00.000Z'),
    lastMessageAt: new Date('2026-07-07T10:00:00.000Z'),
    participants: [
      { accountId: 'acc-1', lastReadAt: new Date('2026-07-07T10:00:00.000Z'), account: ACC('acc-1') },
      { accountId: 'acc-2', lastReadAt: new Date('2026-07-07T10:00:00.000Z'), account: ACC('acc-2') },
    ],
    messages: [],
    ...over,
  };
}

function makePrisma() {
  return {
    conversation: {
      findUnique: jest.fn().mockResolvedValue(CONV()),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([CONV()]),
      create: jest.fn().mockResolvedValue(CONV()),
      update: jest.fn().mockResolvedValue(CONV()),
      count: jest.fn().mockResolvedValue(0),
    },
    conversationParticipant: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'acc-1', lastReadAt: new Date('2026-07-07T10:00:00.000Z') }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'acc-1',
        body: 'Bonjour',
        attachments: [],
        attachmentIds: [],
        createdAt: new Date('2026-07-07T11:00:00.000Z'),
      }),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-2' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-2' }]),
    },
    media: { findMany: jest.fn().mockResolvedValue([]) },
    notification: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockImplementation((ops: unknown) => {
      if (typeof ops === 'function') return ops(makePrismaTxProxy());
      return Promise.resolve([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'acc-1',
          body: 'Bonjour',
          attachments: [],
          attachmentIds: [],
          createdAt: new Date('2026-07-07T11:00:00.000Z'),
        },
        {},
      ]);
    }),
  };
}
function makePrismaTxProxy() {
  return {};
}

function build(over: {
  prisma?: ReturnType<typeof makePrisma>;
  redis?: Partial<RedisService>;
  queue?: { enqueue: jest.Mock };
  presence?: { get: jest.Mock };
  gateway?: { emitMessageNew: jest.Mock; emitConversationRead: jest.Mock; emitConversationUpdated: jest.Mock };
  blocks?: { isBlockedPair: jest.Mock };
  connections?: { stateBetween: jest.Mock };
} = {}) {
  const prisma = over.prisma ?? makePrisma();
  const redis = over.redis ?? { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(undefined) };
  const queue = over.queue ?? { enqueue: jest.fn().mockResolvedValue(undefined) };
  const presence = over.presence ?? { get: jest.fn().mockResolvedValue({ 'acc-2': { online: true, lastSeen: null } }) };
  const gateway = over.gateway ?? { emitMessageNew: jest.fn(), emitConversationRead: jest.fn(), emitConversationUpdated: jest.fn() };
  const blocks = over.blocks ?? { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const connections = over.connections ?? { stateBetween: jest.fn().mockResolvedValue('none') };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    queue as unknown as QueueService,
    presence as unknown as PresenceService,
    gateway as unknown as MessagingGateway,
    blocks as unknown as BlocksService,
    connections as unknown as ConnectionsService,
  );
  return { service, prisma, redis, queue, presence, gateway, blocks, connections };
}

const origDisable = process.env['DISABLE_RATE_LIMIT'];
const origNodeEnv = process.env['NODE_ENV'];
beforeEach(() => {
  process.env['DISABLE_RATE_LIMIT'] = '';
  process.env['NODE_ENV'] = 'test';
});
afterEach(() => {
  process.env['DISABLE_RATE_LIMIT'] = origDisable;
  process.env['NODE_ENV'] = origNodeEnv;
});

describe('MessagesService — participant authz (no-existence-leak 404)', () => {
  it('getMessages: unknown conversation → 404', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(service.getMessages('acc-1', 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getMessages: non-participant → 404 (not 403 — no existence leak)', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);
    await expect(service.getMessages('stranger', 'conv-1', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sendMessage: non-participant → 404', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);
    await expect(service.sendMessage('stranger', 'conv-1', { body: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('markRead: non-participant → 404', async () => {
    const { service, prisma } = build();
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);
    await expect(service.markRead('stranger', 'conv-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MessagesService.sendMessage — validation', () => {
  it('rejects empty body with no attachment (400)', async () => {
    const { service } = build();
    await expect(service.sendMessage('acc-1', 'conv-1', { body: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a body longer than the max (400)', async () => {
    const { service } = build();
    await expect(
      service.sendMessage('acc-1', 'conv-1', { body: 'x'.repeat(4001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an attachment whose media is not owned by the sender (400)', async () => {
    const { service, prisma } = build();
    prisma.media.findMany.mockResolvedValue([
      { id: 'm-1', ownerId: 'someone-else', kind: 'attachment', status: 'ready', bucketKey: 'attachment/x/m-1.png', contentType: 'image/png' },
    ]);
    await expect(
      service.sendMessage('acc-1', 'conv-1', { attachments: [{ mediaId: 'm-1' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an attachment that is not ready (400)', async () => {
    const { service, prisma } = build();
    prisma.media.findMany.mockResolvedValue([
      { id: 'm-1', ownerId: 'acc-1', kind: 'attachment', status: 'pending', bucketKey: 'attachment/acc-1/m-1.png', contentType: 'image/png' },
    ]);
    await expect(
      service.sendMessage('acc-1', 'conv-1', { attachments: [{ mediaId: 'm-1' }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid message and emits message:new to the participants', async () => {
    const { service, gateway } = build();
    const msg = await service.sendMessage('acc-1', 'conv-1', { body: 'Bonjour' });
    expect(msg.body).toBe('Bonjour');
    expect(gateway.emitMessageNew).toHaveBeenCalledTimes(1);
    // fresh message: no other participant has read it yet
    expect(msg.readBy).toEqual([]);
  });
});

describe('MessagesService.sendMessage — rate limit', () => {
  it('throws 429 when the send rate limit is exceeded', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(31), expire: jest.fn().mockResolvedValue(undefined) };
    const { service } = build({ redis });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'hi' })).rejects.toMatchObject({ status: 429 });
  });

  it('skips the rate limit when DISABLE_RATE_LIMIT=true (non-production)', async () => {
    process.env['DISABLE_RATE_LIMIT'] = 'true';
    const redis = { incr: jest.fn().mockResolvedValue(999), expire: jest.fn().mockResolvedValue(undefined) };
    const { service } = build({ redis });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'hi' })).resolves.toBeDefined();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('M4: DISABLE_RATE_LIMIT=true is ignored in production — rate limit still applies', async () => {
    process.env['DISABLE_RATE_LIMIT'] = 'true';
    process.env['NODE_ENV'] = 'production';
    const redis = { incr: jest.fn().mockResolvedValue(31), expire: jest.fn().mockResolvedValue(undefined) };
    const { service } = build({ redis });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'hi' })).rejects.toMatchObject({ status: 429 });
  });
});

describe('MessagesService.sendMessage — offline recipient fan-out (F-5)', () => {
  it('enqueues a message notification for an OFFLINE recipient with no existing unread notif', async () => {
    const presence = { get: jest.fn().mockResolvedValue({ 'acc-2': { online: false, lastSeen: null } }) };
    const { service, queue } = build({ presence });
    await service.sendMessage('acc-1', 'conv-1', { body: 'hi' });
    expect(queue.enqueue).toHaveBeenCalledWith(
      'notifications-fanout',
      expect.any(String),
      expect.objectContaining({ recipientId: 'acc-2', type: 'message', refId: 'conv-1', sourceUserId: 'acc-1' }),
      expect.anything(),
    );
  });

  it('does NOT enqueue for an ONLINE recipient', async () => {
    const presence = { get: jest.fn().mockResolvedValue({ 'acc-2': { online: true, lastSeen: null } }) };
    const { service, queue } = build({ presence });
    await service.sendMessage('acc-1', 'conv-1', { body: 'hi' });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when the offline recipient already has an unread message notif (dedupe)', async () => {
    const presence = { get: jest.fn().mockResolvedValue({ 'acc-2': { online: false, lastSeen: null } }) };
    const prisma = makePrisma();
    prisma.notification.findFirst.mockResolvedValue({ id: 'notif-1' }); // existing unread
    const { service, queue } = build({ presence, prisma });
    await service.sendMessage('acc-1', 'conv-1', { body: 'hi' });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('MessagesService.createConversation — DM', () => {
  it('rejects a self-DM (400)', async () => {
    const { service } = build();
    await expect(service.createConversation('acc-1', { participantId: 'acc-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown participant (404)', async () => {
    const { service, prisma } = build();
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.createConversation('acc-1', { participantId: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent: returns the existing DM when one already exists for the pair', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ id: 'existing-dm' }));
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(item.id).toBe('existing-dm');
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });
});

describe('MessagesService.createConversation — group', () => {
  // Contract change (contacts-DM follow-up 5b): the group name is OPTIONAL — a blank/absent name is
  // stored as null and the title falls back to the participants (PATCH /conversations/:id sets it later).
  it('accepts a blank name and stores null (name is optional now)', async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2' }]);
    prisma.conversation.create.mockResolvedValue(CONV({ id: 'grp-1', type: 'group', name: null, dmKey: null }));
    await service.createConversation('acc-1', { name: '  ', participantIds: ['acc-2'] });
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'group', name: null }) }),
    );
  });

  // Security regression (found by probing, 2026-07-26): `{ participantIds: [X] }` was a complete
  // bypass of MC-10 blocks and F-19 dmPolicy. The DM arm refused, but a two-person "group" reaching
  // the same person was created and delivered — the blocker saw it as unread in their inbox.
  it('refuses to create a group with someone the caller is block-paired with', async () => {
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service, prisma } = build({ blocks });
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2', preferences: {} }]);
    await expect(
      service.createConversation('acc-1', { participantIds: ['acc-2'] }),
    ).rejects.toThrow("Impossible d'envoyer le message.");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("refuses a participant whose dmPolicy is 'contacts' and who is not a contact", async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2', preferences: { dmPolicy: 'contacts' } }]);
    await expect(
      service.createConversation('acc-1', { participantIds: ['acc-2'] }),
    ).rejects.toThrow("Impossible d'envoyer le message.");
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("allows a participant whose dmPolicy is 'anyone'", async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2', preferences: { dmPolicy: 'anyone' } }]);
    prisma.conversation.create.mockResolvedValue(CONV({ id: 'grp-1', type: 'group', name: null, dmKey: null }));
    await expect(service.createConversation('acc-1', { participantIds: ['acc-2'] })).resolves.toBeTruthy();
    expect(prisma.conversation.create).toHaveBeenCalled();
  });

  it('still rejects a name over the max length (400)', async () => {
    const { service } = build();
    await expect(
      service.createConversation('acc-1', { name: 'x'.repeat(81), participantIds: ['acc-2'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a group with no other valid participant (needs ≥2 total) (400)', async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([]); // none of the ids exist
    await expect(
      service.createConversation('acc-1', { name: 'Projet', participantIds: ['ghost'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a group with the creator + distinct valid participants', async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2' }, { id: 'acc-3' }]);
    prisma.conversation.create.mockResolvedValue(
      CONV({ id: 'grp-1', type: 'group', name: 'Projet', dmKey: null }),
    );
    const item = await service.createConversation('acc-1', {
      name: 'Projet',
      participantIds: ['acc-2', 'acc-2', 'acc-3'],
    });
    expect(item.type).toBe('group');
    expect(prisma.conversation.create).toHaveBeenCalled();
  });
});

describe('MessagesService.markRead', () => {
  it('sets lastReadAt, marks matching message notifications read, emits conversation:read, returns 0', async () => {
    const { service, prisma, gateway } = build();
    const res = await service.markRead('acc-1', 'conv-1');
    expect(res).toEqual({ unreadCount: 0 });
    expect(prisma.conversationParticipant.update).toHaveBeenCalled();
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ recipientId: 'acc-1', type: 'message', refId: 'conv-1', readAt: null }),
      }),
    );
    expect(gateway.emitConversationRead).toHaveBeenCalledTimes(1);
  });
});

describe('MessagesService.listConversations', () => {
  it('returns totalUnread summed from the unread-per-conversation query and resolves DM name to the other party', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValue([{ conversationId: 'conv-1', unread: 3n }]);
    const res = await service.listConversations('acc-1', {});
    expect(res.totalUnread).toBe(3);
    expect(res.items[0].unreadCount).toBe(3);
    expect(res.items[0].name).toBe('Name acc-2'); // DM → the other participant's display name
  });

  it("MC-11 drift guard: excludes the salon conversation from the widget list", async () => {
    const { service, prisma } = build();
    await service.listConversations('acc-1', {});
    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.type).toEqual({ not: 'salon' });
  });

  it("MC-11 drift guard: the unread query joins Conversation and excludes salon rows", async () => {
    const { service, prisma } = build();
    await service.listConversations('acc-1', {});
    // Prisma tagged-template: strings[] carry the literal SQL; assert the salon exclusion is present.
    const sqlParts = prisma.$queryRaw.mock.calls[0][0] as { raw?: string[] } | TemplateStringsArray;
    const sql = Array.isArray((sqlParts as { raw?: string[] }).raw)
      ? (sqlParts as { raw: string[] }).raw.join('?')
      : (sqlParts as unknown as string[]).join('?');
    expect(sql).toContain('salon');
  });
});

describe('MessagesService — MC-10 block enforcement', () => {
  it('sendMessage on a blocked DM pair → neutral 400, no message persisted', async () => {
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service, prisma } = build({ blocks });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'Salut' })).rejects.toThrow(
      "Impossible d'envoyer le message.",
    );
    expect(blocks.isBlockedPair).toHaveBeenCalledWith('acc-1', 'acc-2');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('the neutral error is a BadRequestException (no block disclosure)', async () => {
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service } = build({ blocks });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'Salut' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('group sends are unaffected by blocks', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ type: 'group', name: 'Projet' }));
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service } = build({ prisma, blocks });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'Salut' })).resolves.toBeTruthy();
    expect(blocks.isBlockedPair).not.toHaveBeenCalled();
  });

  it('getMessages history stays readable on a blocked pair', async () => {
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service } = build({ blocks });
    await expect(service.getMessages('acc-1', 'conv-1', {})).resolves.toBeTruthy();
  });

  it('createConversation (getOrCreateDm) on a blocked pair → neutral 400', async () => {
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(true) };
    const { service } = build({ blocks });
    await expect(service.createConversation('acc-1', { participantId: 'acc-2' })).rejects.toThrow(
      "Impossible d'envoyer le message.",
    );
  });
});

// ── MC-9 delta: DM policy routing (F-19) + request lifecycle ──────────────────
describe('MessagesService.getOrCreateDm — DM policy routing (F-19)', () => {
  // Route a brand-new DM (no existing conversation for the pair): make findUnique return null and
  // capture the create() data so we can assert the routed status/requestedBy.
  function newDmBuild(over: {
    dmPolicy?: string;
    state?: string;
    blocked?: boolean;
  } = {}) {
    const built = build({
      connections: { stateBetween: jest.fn().mockResolvedValue(over.state ?? 'none') },
      ...(over.blocked ? { blocks: { isBlockedPair: jest.fn().mockResolvedValue(true) } } : {}),
    });
    built.prisma.conversation.findUnique.mockResolvedValue(null); // no existing DM
    built.prisma.account.findFirst.mockResolvedValue({
      id: 'acc-2',
      ...(over.dmPolicy !== undefined ? { preferences: { dmPolicy: over.dmPolicy } } : {}),
    });
    built.prisma.conversation.create.mockImplementation((args: { data: { status?: string; requestedBy?: string | null } }) =>
      Promise.resolve(CONV({ status: args.data.status ?? 'open', requestedBy: args.data.requestedBy ?? null })),
    );
    return built;
  }

  it('J1: non-contact, recipient dmPolicy="anyone" → conversation created status="open"', async () => {
    const { service, prisma } = newDmBuild({ dmPolicy: 'anyone', state: 'none' });
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'open' }) }),
    );
    expect(item.status).toBe('open');
  });

  it('J2: non-contact, recipient with NO dmPolicy key → status="requested", requestedBy=caller (default "requests")', async () => {
    const { service, prisma } = newDmBuild({ state: 'none' }); // preferences absent
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'requested', requestedBy: 'acc-1' }) }),
    );
    expect(item.status).toBe('requested');
    expect(item.requestedBy).toBe('acc-1');
  });

  it('J3: non-contact, recipient "contacts" → 400 with the contacts-only copy, no conversation created', async () => {
    const { service, prisma } = newDmBuild({ dmPolicy: 'contacts', state: 'none' });
    await expect(service.createConversation('acc-1', { participantId: 'acc-2' })).rejects.toThrow(
      "Ce membre n'accepte que les messages de ses contacts.",
    );
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('J4: CONNECTED pair always opens a normal thread regardless of policy ("contacts")', async () => {
    const { service, prisma } = newDmBuild({ dmPolicy: 'contacts', state: 'connected' });
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'open' }) }),
    );
    expect(item.status).toBe('open');
  });

  it('J4: CONNECTED pair with "requests" policy also opens a normal thread (not a request)', async () => {
    const { service } = newDmBuild({ dmPolicy: 'requests', state: 'connected' });
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(item.status).toBe('open');
  });

  it('J5: blocked pair + "contacts" policy → neutral 400 (block check precedes policy; no policy disclosure)', async () => {
    const { service, prisma, connections } = newDmBuild({ dmPolicy: 'contacts', blocked: true });
    await expect(service.createConversation('acc-1', { participantId: 'acc-2' })).rejects.toThrow(
      "Impossible d'envoyer le message.",
    );
    expect(connections.stateBetween).not.toHaveBeenCalled(); // policy never consulted for a blocked caller
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('J11: POST after a decline flips the row back to requested (re-request, decision D1)', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'declined', requestedBy: 'acc-1' }));
    prisma.conversation.update.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'requested', requestedBy: 'acc-1' }) }),
    );
    expect(item.status).toBe('requested');
  });

  it('returns an existing OPEN DM without re-routing (policy never retro-closes threads)', async () => {
    const { service, prisma } = build();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ id: 'open-dm', status: 'open' }));
    const item = await service.createConversation('acc-1', { participantId: 'acc-2' });
    expect(item.id).toBe('open-dm');
    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });
});

describe('MessagesService.sendMessage — request-state send gating (BE-6)', () => {
  it('J6: the requester may send opening messages into their own requested conversation', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    const { service } = build({ prisma });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'Bonjour' })).resolves.toBeDefined();
  });

  it('J6: the RECIPIENT cannot send into a requested conversation → 400 "Acceptez la demande pour répondre."', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    const { service } = build({ prisma });
    await expect(service.sendMessage('acc-2', 'conv-1', { body: 'Salut' })).rejects.toThrow(
      'Acceptez la demande pour répondre.',
    );
  });

  it('J9: a declined conversation refuses BOTH parties with the neutral copy', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'declined', requestedBy: 'acc-1' }));
    const { service } = build({ prisma });
    await expect(service.sendMessage('acc-1', 'conv-1', { body: 'x' })).rejects.toThrow("Impossible d'envoyer le message.");
    await expect(service.sendMessage('acc-2', 'conv-1', { body: 'x' })).rejects.toThrow("Impossible d'envoyer le message.");
  });
});

describe('MessagesService.respondToRequest — accept/decline (BE-4)', () => {
  it('J8: recipient accepts → status="open", emits conversation:updated to both participants, recipient can reply', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    prisma.conversation.update.mockResolvedValue(CONV({ status: 'open' }));
    const gateway = { emitMessageNew: jest.fn(), emitConversationRead: jest.fn(), emitConversationUpdated: jest.fn() };
    const { service } = build({ prisma, gateway });
    const item = await service.respondToRequest('acc-2', 'conv-1', 'accept');
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv-1' }, data: expect.objectContaining({ status: 'open' }) }),
    );
    expect(item.status).toBe('open');
    expect(gateway.emitConversationUpdated).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2']),
      { conversationId: 'conv-1' },
    );
  });

  it('J9: recipient declines → status="declined", emits conversation:updated, enqueues no notification', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    prisma.conversation.update.mockResolvedValue(CONV({ status: 'declined', requestedBy: 'acc-1' }));
    const gateway = { emitMessageNew: jest.fn(), emitConversationRead: jest.fn(), emitConversationUpdated: jest.fn() };
    const { service, queue } = build({ prisma, gateway });
    await service.respondToRequest('acc-2', 'conv-1', 'decline');
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'declined' }) }),
    );
    expect(gateway.emitConversationUpdated).toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('J10: the REQUESTER calling respondToRequest → 404 (recipient-only, no state disclosure)', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    const { service } = build({ prisma });
    await expect(service.respondToRequest('acc-1', 'conv-1', 'accept')).rejects.toThrow('Conversation introuvable.');
  });

  it('J10: a stranger (non-participant) → 404', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'requested', requestedBy: 'acc-1' }));
    const { service } = build({ prisma });
    await expect(service.respondToRequest('stranger', 'conv-1', 'accept')).rejects.toThrow('Conversation introuvable.');
  });

  it('J10: responding on an already-open conversation → 404', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(CONV({ status: 'open' }));
    const { service } = build({ prisma });
    await expect(service.respondToRequest('acc-2', 'conv-1', 'accept')).rejects.toThrow('Conversation introuvable.');
  });
});

describe('MessagesService.listConversations — requests filter + counts (BE-5)', () => {
  it('J7: recipient main list excludes incoming requests; only open + own-outgoing requests are visible', async () => {
    const { service, prisma } = build();
    await service.listConversations('acc-2', {});
    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: 'open' },
      { status: 'requested', requestedBy: 'acc-2' },
    ]);
  });

  it('J7: totalUnread and the unread query are scoped to OPEN conversations only', async () => {
    const { service, prisma } = build();
    await service.listConversations('acc-2', {});
    const sqlParts = prisma.$queryRaw.mock.calls[0][0] as { raw?: string[] };
    const sql = Array.isArray(sqlParts.raw) ? sqlParts.raw.join('?') : '';
    expect(sql).toMatch(/status.*=.*'open'|'open'/);
  });

  it('J7: filter=requests returns the recipient incoming pending requests and requestsCount', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValue([CONV({ status: 'requested', requestedBy: 'acc-1' })]);
    prisma.conversation.count.mockResolvedValue(1);
    const res = await service.listConversations('acc-2', { filter: 'requests' });
    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ type: 'dm', status: 'requested', requestedBy: { not: 'acc-2' } });
    expect(res.items[0].status).toBe('requested');
    expect(res.requestsCount).toBe(1);
  });

  it('J7: requestsCount is always computed (backs the Demandes badge) even on the main list', async () => {
    const { service, prisma } = build();
    prisma.conversation.count.mockResolvedValue(2);
    const res = await service.listConversations('acc-2', {});
    expect(prisma.conversation.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'dm', status: 'requested', requestedBy: { not: 'acc-2' } }) }),
    );
    expect(res.requestsCount).toBe(2);
  });

  it('J7: requester main list INCLUDES their own outgoing request', async () => {
    const { service, prisma } = build();
    prisma.conversation.findMany.mockResolvedValue([CONV({ status: 'requested', requestedBy: 'acc-1' })]);
    const res = await service.listConversations('acc-1', {});
    expect(res.items[0].status).toBe('requested');
    expect(res.items[0].requestedBy).toBe('acc-1');
  });
});
