import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { QueueService } from '../queue/queue.service';
import type { PresenceService } from '../connections/presence.service';
import type { MessagingGateway } from './messaging.gateway';
import type { BlocksService } from '../blocks/blocks.service';

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
  gateway?: { emitMessageNew: jest.Mock; emitConversationRead: jest.Mock };
  blocks?: { isBlockedPair: jest.Mock };
} = {}) {
  const prisma = over.prisma ?? makePrisma();
  const redis = over.redis ?? { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(undefined) };
  const queue = over.queue ?? { enqueue: jest.fn().mockResolvedValue(undefined) };
  const presence = over.presence ?? { get: jest.fn().mockResolvedValue({ 'acc-2': { online: true, lastSeen: null } }) };
  const gateway = over.gateway ?? { emitMessageNew: jest.fn(), emitConversationRead: jest.fn() };
  const blocks = over.blocks ?? { isBlockedPair: jest.fn().mockResolvedValue(false) };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    queue as unknown as QueueService,
    presence as unknown as PresenceService,
    gateway as unknown as MessagingGateway,
    blocks as unknown as BlocksService,
  );
  return { service, prisma, redis, queue, presence, gateway, blocks };
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
  it('rejects a missing/blank name (400)', async () => {
    const { service } = build();
    await expect(
      service.createConversation('acc-1', { name: '  ', participantIds: ['acc-2'] }),
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
});

describe('MessagesService — MC-10 block enforcement (DM only)', () => {
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
