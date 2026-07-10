import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { QueueService } from '../queue/queue.service';
import type { PresenceService } from '../connections/presence.service';
import type { MessagingGateway } from './messaging.gateway';
import type { BlocksService } from '../blocks/blocks.service';
import type { ConnectionsService } from '../connections/connections.service';

// MC-12: group management (add/kick/leave + createdBy owner). Self-contained mocks (interactive
// $transaction proxy needed for the leave/transfer path) in the style of messages.service.spec.ts.

const ACC = (id: string) => ({ id, displayName: `Name ${id}`, profileSlug: `slug-${id}`, avatar: null });

function PART(accountId: string, createdAt: string) {
  return { accountId, lastReadAt: new Date(createdAt), createdAt: new Date(createdAt), account: ACC(accountId) };
}

/** A group owned by acc-1 with members acc-1 (owner), acc-2, acc-3. */
function GROUP(over: Record<string, unknown> = {}) {
  return {
    id: 'grp-1',
    type: 'group',
    name: 'Projet',
    projectId: null,
    dmKey: null,
    status: 'open',
    requestedBy: null,
    createdBy: 'acc-1',
    createdAt: new Date('2026-07-07T10:00:00.000Z'),
    lastMessageAt: new Date('2026-07-07T10:00:00.000Z'),
    participants: [
      PART('acc-1', '2026-07-07T10:00:00.000Z'),
      PART('acc-2', '2026-07-07T10:00:00.000Z'),
      PART('acc-3', '2026-07-07T10:00:00.001Z'),
    ],
    messages: [],
    ...over,
  };
}

function makePrisma(conv: Record<string, unknown> = GROUP()) {
  const tx = {
    conversationParticipant: {
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ accountId: 'acc-2' }, { accountId: 'acc-3' }]),
    },
    conversation: {
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue(conv),
      create: jest.fn().mockResolvedValue(conv),
    },
    conversationParticipant: {
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    account: {
      findFirst: jest.fn().mockResolvedValue({ id: 'acc-9' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'acc-2' }, { id: 'acc-3' }]),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown) => {
      if (typeof ops === 'function') return (ops as (t: unknown) => unknown)(tx);
      return Promise.resolve([]);
    }),
    __tx: tx,
  };
  return prisma;
}

function build(prisma: ReturnType<typeof makePrisma> = makePrisma()) {
  const redis = { incr: jest.fn(), expire: jest.fn() };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const presence = { get: jest.fn().mockResolvedValue({}) };
  const gateway = {
    emitParticipantAdded: jest.fn(),
    emitParticipantRemoved: jest.fn(),
    emitConversationDeleted: jest.fn(),
  };
  const blocks = { isBlockedPair: jest.fn() };
  const connections = { stateBetween: jest.fn() };
  const service = new MessagesService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    queue as unknown as QueueService,
    presence as unknown as PresenceService,
    gateway as unknown as MessagingGateway,
    blocks as unknown as BlocksService,
    connections as unknown as ConnectionsService,
  );
  return { service, prisma, queue, gateway };
}

// ── createGroup sets createdBy ────────────────────────────────────────────────
describe('MessagesService.createGroup — owner (MC-12)', () => {
  it('sets createdBy to the caller on group creation', async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2' }]);
    prisma.conversation.create.mockResolvedValue(GROUP());
    await service.createConversation('acc-1', { name: 'Projet', participantIds: ['acc-2'] });
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdBy: 'acc-1' }) }),
    );
  });

  it('toItem carries createdBy through to the DTO', async () => {
    const { service, prisma } = build();
    prisma.account.findMany.mockResolvedValue([{ id: 'acc-2' }]);
    prisma.conversation.create.mockResolvedValue(GROUP());
    const item = await service.createConversation('acc-1', { name: 'Projet', participantIds: ['acc-2'] });
    expect(item.createdBy).toBe('acc-1');
  });
});

// ── project-linked groups are NOT managed here (CS-8/MC-3/CS-10 own their membership) ─────────
describe('MessagesService — project-linked group is not manageable (MC-12 scope)', () => {
  const PROJECT_GROUP = () => makePrisma(GROUP({ projectId: 'proj-1' }));
  const MSG = 'Ce groupe est géré par son projet.';

  it('add on a project-linked group → 409 (project-managed)', async () => {
    const { service } = build(PROJECT_GROUP());
    await expect(service.addParticipant('acc-1', 'grp-1', { accountId: 'acc-9' })).rejects.toThrow(MSG);
  });

  it('kick on a project-linked group → 409 (project-managed)', async () => {
    const { service } = build(PROJECT_GROUP());
    await expect(service.removeParticipant('acc-1', 'grp-1', 'acc-3')).rejects.toThrow(MSG);
  });

  it('leave on a project-linked group → 409 (project-managed)', async () => {
    const { service } = build(PROJECT_GROUP());
    await expect(service.leaveConversation('acc-2', 'grp-1')).rejects.toThrow(MSG);
  });
});

// ── addParticipant (creator only) ─────────────────────────────────────────────
describe('MessagesService.addParticipant (MC-12)', () => {
  it('creator adds a valid account → participant created + emitParticipantAdded with all ids incl. the new member', async () => {
    const prisma = makePrisma();
    // reload after create returns the group + the new member acc-9
    const withNew = GROUP({
      participants: [
        PART('acc-1', '2026-07-07T10:00:00.000Z'),
        PART('acc-2', '2026-07-07T10:00:00.000Z'),
        PART('acc-3', '2026-07-07T10:00:00.001Z'),
        PART('acc-9', '2026-07-07T12:00:00.000Z'),
      ],
    });
    prisma.conversation.findUnique.mockResolvedValueOnce(GROUP()).mockResolvedValueOnce(withNew);
    const { service, gateway } = build(prisma);
    const item = await service.addParticipant('acc-1', 'grp-1', { accountId: 'acc-9' });
    expect(prisma.conversationParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { conversationId: 'grp-1', accountId: 'acc-9' } }),
    );
    expect(item.participants.map((p) => p.userId)).toContain('acc-9');
    expect(gateway.emitParticipantAdded).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2', 'acc-3', 'acc-9']),
      expect.objectContaining({ conversationId: 'grp-1', participant: expect.objectContaining({ userId: 'acc-9' }) }),
    );
  });

  it('non-creator → 403', async () => {
    const { service } = build();
    await expect(service.addParticipant('acc-2', 'grp-1', { accountId: 'acc-9' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('non-member caller → 404 (Conversation introuvable.)', async () => {
    const prisma = makePrisma();
    prisma.conversation.findUnique.mockResolvedValue(GROUP()); // caller not in participants
    const { service } = build(prisma);
    await expect(service.addParticipant('stranger', 'grp-1', { accountId: 'acc-9' })).rejects.toThrow(
      'Conversation introuvable.',
    );
  });

  it('dm conversation → 400 (group-only)', async () => {
    const prisma = makePrisma(GROUP({ type: 'dm', createdBy: null }));
    const { service } = build(prisma);
    await expect(service.addParticipant('acc-1', 'grp-1', { accountId: 'acc-9' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('unknown target account → 404', async () => {
    const prisma = makePrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    const { service } = build(prisma);
    await expect(service.addParticipant('acc-1', 'grp-1', { accountId: 'ghost' })).rejects.toThrow(
      'Ce membre est introuvable.',
    );
  });

  it('already-member target → no-op (no create, returns the item)', async () => {
    const prisma = makePrisma();
    const { service, gateway } = build(prisma);
    const item = await service.addParticipant('acc-1', 'grp-1', { accountId: 'acc-2' });
    expect(prisma.conversationParticipant.create).not.toHaveBeenCalled();
    expect(gateway.emitParticipantAdded).not.toHaveBeenCalled();
    expect(item.id).toBe('grp-1');
  });
});

// ── removeParticipant / kick (creator only) ───────────────────────────────────
describe('MessagesService.removeParticipant (MC-12 kick)', () => {
  it('creator kicks a member → deleted, emitParticipantRemoved payload, group_removed notification enqueued', async () => {
    const prisma = makePrisma();
    const { service, gateway, queue } = build(prisma);
    await service.removeParticipant('acc-1', 'grp-1', 'acc-3');
    expect(prisma.conversationParticipant.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_accountId: { conversationId: 'grp-1', accountId: 'acc-3' } } }),
    );
    expect(gateway.emitParticipantRemoved).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2', 'acc-3']),
      { conversationId: 'grp-1', userId: 'acc-3', createdBy: 'acc-1' },
    );
    expect(queue.enqueue).toHaveBeenCalledWith(
      'notifications-fanout',
      'group_removed',
      expect.objectContaining({ recipientId: 'acc-3', type: 'group_removed', refId: 'grp-1', sourceUserId: 'acc-1' }),
      expect.anything(),
    );
  });

  it('non-creator → 403', async () => {
    const { service } = build();
    await expect(service.removeParticipant('acc-2', 'grp-1', 'acc-3')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('target = createdBy (creator self-target) → 400', async () => {
    const { service } = build();
    await expect(service.removeParticipant('acc-1', 'grp-1', 'acc-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('target not a member → 404', async () => {
    const { service } = build();
    await expect(service.removeParticipant('acc-1', 'grp-1', 'ghost')).rejects.toThrow(
      'Ce membre ne fait pas partie du groupe.',
    );
  });

  it('non-member caller → 404', async () => {
    const { service } = build();
    await expect(service.removeParticipant('stranger', 'grp-1', 'acc-3')).rejects.toThrow('Conversation introuvable.');
  });
});

// ── leaveConversation (any member) + atomic transfer ──────────────────────────
describe('MessagesService.leaveConversation (MC-12 leave)', () => {
  it('non-creator leaves → own row deleted, createdBy unchanged, emitParticipantRemoved includes the leaver', async () => {
    const prisma = makePrisma();
    const { service, gateway } = build(prisma);
    await service.leaveConversation('acc-2', 'grp-1');
    expect(prisma.__tx.conversationParticipant.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_accountId: { conversationId: 'grp-1', accountId: 'acc-2' } } }),
    );
    expect(prisma.__tx.conversation.update).not.toHaveBeenCalled();
    expect(gateway.emitParticipantRemoved).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2', 'acc-3']),
      { conversationId: 'grp-1', userId: 'acc-2', createdBy: 'acc-1' },
    );
  });

  it('creator leaves with ≥1 remaining → createdBy reassigned to earliest-joined, emit carries the NEW createdBy', async () => {
    const prisma = makePrisma();
    // remaining ordered by createdAt asc, accountId asc → acc-2 first
    prisma.__tx.conversationParticipant.findMany.mockResolvedValue([{ accountId: 'acc-2' }, { accountId: 'acc-3' }]);
    const { service, gateway } = build(prisma);
    await service.leaveConversation('acc-1', 'grp-1');
    expect(prisma.__tx.conversationParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }] }),
    );
    expect(prisma.__tx.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'grp-1' }, data: { createdBy: 'acc-2' } }),
    );
    expect(gateway.emitParticipantRemoved).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2', 'acc-3']),
      { conversationId: 'grp-1', userId: 'acc-1', createdBy: 'acc-2' },
    );
  });

  it('last member leaves → conversation deleted + emitConversationDeleted (no participant:removed)', async () => {
    const prisma = makePrisma();
    prisma.__tx.conversationParticipant.findMany.mockResolvedValue([]);
    const { service, gateway } = build(prisma);
    await service.leaveConversation('acc-1', 'grp-1');
    expect(prisma.__tx.conversation.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'grp-1' } }));
    expect(gateway.emitConversationDeleted).toHaveBeenCalledWith(
      expect.arrayContaining(['acc-1', 'acc-2', 'acc-3']),
      { conversationId: 'grp-1' },
    );
    expect(gateway.emitParticipantRemoved).not.toHaveBeenCalled();
  });

  it('transaction failure → no WS emit', async () => {
    const prisma = makePrisma();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const { service, gateway } = build(prisma);
    await expect(service.leaveConversation('acc-2', 'grp-1')).rejects.toThrow('db down');
    expect(gateway.emitParticipantRemoved).not.toHaveBeenCalled();
    expect(gateway.emitConversationDeleted).not.toHaveBeenCalled();
  });

  it('dm → 400 (group-only)', async () => {
    const prisma = makePrisma(GROUP({ type: 'dm', createdBy: null }));
    const { service } = build(prisma);
    await expect(service.leaveConversation('acc-1', 'grp-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-member → 404', async () => {
    const { service } = build();
    await expect(service.leaveConversation('stranger', 'grp-1')).rejects.toThrow('Conversation introuvable.');
  });
});
