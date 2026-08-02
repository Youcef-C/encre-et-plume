import { MessagingGateway } from './messaging.gateway';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { RedisService } from '../redis/redis.service';
import type { SessionStore } from '../security/session-store.service';

// Minimal fake socket capturing joins / disconnect / data.
function makeSocket(cookie?: string) {
  return {
    id: 'sock-1',
    handshake: { headers: { cookie, 'user-agent': 'jest' }, address: '127.0.0.1' },
    data: {} as Record<string, unknown>,
    rooms: new Set<string>(),
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

function build(over: {
  jwt?: { verify: jest.Mock };
  redis?: { getOrThrow: jest.Mock };
  prisma?: { conversationParticipant: { findUnique: jest.Mock; findMany: jest.Mock } };
  sessionStore?: { touch: jest.Mock };
} = {}) {
  const jwt = over.jwt ?? { verify: jest.fn().mockReturnValue({ sub: 'acc-1', jti: 'tok-1', exp: 9e9, iat: 1 }) };
  const redis = over.redis ?? { getOrThrow: jest.fn().mockResolvedValue(null) };
  const prisma = over.prisma ?? {
    conversationParticipant: {
      findUnique: jest.fn().mockResolvedValue({ accountId: 'acc-1' }),
      findMany: jest.fn().mockResolvedValue([{ accountId: 'acc-1' }, { accountId: 'acc-2' }]),
    },
  };
  const sessionStore = over.sessionStore ?? { touch: jest.fn().mockResolvedValue(undefined) };
  const gateway = new MessagingGateway(
    jwt as unknown as JwtService,
    redis as unknown as RedisService,
    prisma as unknown as PrismaService,
    sessionStore as unknown as SessionStore,
  );
  return { gateway, jwt, redis, prisma, sessionStore };
}

describe('MessagingGateway.handleConnection (fail closed)', () => {
  it('disconnects a handshake with no cookie', async () => {
    const { gateway } = build();
    const socket = makeSocket(undefined);
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a handshake with an invalid JWT', async () => {
    const jwt = { verify: jest.fn(() => { throw new Error('bad'); }) };
    const { gateway } = build({ jwt });
    const socket = makeSocket('ep_session=bad');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a denylisted (logged-out) session', async () => {
    const redis = { getOrThrow: jest.fn((k: string) => Promise.resolve(k.startsWith('denylist:') ? '1' : null)) };
    const { gateway } = build({ redis });
    const socket = makeSocket('ep_session=good');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins the user room + touches presence for a valid handshake', async () => {
    const { gateway, sessionStore } = build();
    const socket = makeSocket('ep_session=good');
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('user:acc-1');
    expect(socket.data['accountId']).toBe('acc-1');
    expect(sessionStore.touch).toHaveBeenCalledWith('acc-1', 'tok-1', 'jest', expect.anything());
    gateway.handleDisconnect(socket as never); // clean up the presence interval
  });

  it('joins the shared salon room (MC-11 — every authed socket is a previewer)', async () => {
    const { gateway } = build();
    const socket = makeSocket('ep_session=good');
    await gateway.handleConnection(socket as never);
    expect(socket.join).toHaveBeenCalledWith('salon');
    gateway.handleDisconnect(socket as never);
  });
});

describe('MessagingGateway salon (MC-11)', () => {
  it('emitSalonMessage broadcasts salon:message to the salon room', () => {
    const { gateway } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    const message = {
      id: 'm-1', senderId: 'acc-1', senderName: 'Me', body: 'hi', createdAt: 'x',
      replyTo: null, editedAt: null, likeCount: 0, likedByMe: false,
    };
    gateway.emitSalonMessage({ message });
    expect(to).toHaveBeenCalledWith('salon');
    expect(emit).toHaveBeenCalledWith('salon:message', { message });
  });

  it('emitSalonMessage is a no-op when the socket server is absent (worker context)', () => {
    const { gateway } = build();
    (gateway as unknown as { server: unknown }).server = undefined;
    expect(() =>
      gateway.emitSalonMessage({
        message: {
          id: 'm', senderId: 'a', senderName: 'A', body: 'b', createdAt: 'x',
          // MC-15 fields — every message DTO carries them now.
          replyTo: null, editedAt: null, likeCount: 0, likedByMe: false,
        },
      }),
    ).not.toThrow();
  });

  it('getSalonOnlineAccountIds dedupes accountIds across sockets', async () => {
    const { gateway } = build();
    const fetchSockets = jest.fn().mockResolvedValue([
      { data: { accountId: 'acc-1' } },
      { data: { accountId: 'acc-2' } },
      { data: { accountId: 'acc-1' } }, // same user, second tab
      { data: {} }, // unauthenticated (shouldn't happen, but guard it)
    ]);
    (gateway as unknown as { server: unknown }).server = { in: jest.fn().mockReturnValue({ fetchSockets }) };
    const ids = await gateway.getSalonOnlineAccountIds();
    expect(ids.sort()).toEqual(['acc-1', 'acc-2']);
  });

  it('getSalonOnlineAccountIds returns [] when there is no server', async () => {
    const { gateway } = build();
    (gateway as unknown as { server: unknown }).server = undefined;
    await expect(gateway.getSalonOnlineAccountIds()).resolves.toEqual([]);
  });
});

describe('MessagingGateway typing relay (participant-gated)', () => {
  it('relays typing only to the OTHER participants when the socket is a member', async () => {
    const { gateway, prisma } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-1';
    await gateway.handleTyping(socket as never, { conversationId: 'conv-1', isTyping: true });
    // membership confirmed, relayed to acc-2's room only (not the sender's)
    expect(prisma.conversationParticipant.findUnique).toHaveBeenCalled();
    expect(to).toHaveBeenCalledWith(['user:acc-2']);
    expect(emit).toHaveBeenCalledWith('typing', { conversationId: 'conv-1', userId: 'acc-1', isTyping: true });
  });

  it('drops typing silently when the socket is NOT a participant (no membership probe)', async () => {
    const prisma = {
      conversationParticipant: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const { gateway } = build({ prisma });
    const to = jest.fn().mockReturnValue({ emit: jest.fn() });
    (gateway as unknown as { server: unknown }).server = { to };
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'stranger';
    await gateway.handleTyping(socket as never, { conversationId: 'conv-1', isTyping: true });
    expect(to).not.toHaveBeenCalled();
  });
});

describe('MessagingGateway Comptoir membership broadcasts (MC-13)', () => {
  function serverOf(gateway: MessagingGateway) {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    return { emit, to };
  }

  it('emitSalonMemberJoined broadcasts salon:member:joined { user } to the salon room', () => {
    const { gateway } = build();
    const { emit, to } = serverOf(gateway);
    const user = { id: 'acc-1', name: 'Alice', avatarUrl: null, slug: 'alice' };
    gateway.emitSalonMemberJoined({ user });
    expect(to).toHaveBeenCalledWith('salon');
    expect(emit).toHaveBeenCalledWith('salon:member:joined', { user });
  });

  it('emitSalonMemberLeft broadcasts salon:member:left { userId } to the salon room', () => {
    const { gateway } = build();
    const { emit, to } = serverOf(gateway);
    gateway.emitSalonMemberLeft({ userId: 'acc-9' });
    expect(to).toHaveBeenCalledWith('salon');
    expect(emit).toHaveBeenCalledWith('salon:member:left', { userId: 'acc-9' });
  });

  it('both are no-ops (never throw) when the socket server is absent (worker context)', () => {
    const { gateway } = build();
    (gateway as unknown as { server: unknown }).server = undefined;
    expect(() => gateway.emitSalonMemberJoined({ user: { id: 'a', name: 'A', avatarUrl: null, slug: 'a' } })).not.toThrow();
    expect(() => gateway.emitSalonMemberLeft({ userId: 'a' })).not.toThrow();
  });
});

describe('MessagingGateway.emitMessageNew', () => {
  it('emits message:new to every recipient user room', () => {
    const { gateway } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    gateway.emitMessageNew(['acc-1', 'acc-2'], {
      conversationId: 'conv-1',
      message: {
        id: 'm-1', conversationId: 'conv-1', senderId: 'acc-1', body: 'hi', attachments: [], createdAt: 'x', readBy: [],
        replyTo: null, editedAt: null, likeCount: 0, likedByMe: false,
      },
      conversationName: 'Name',
      senderName: 'Sender',
    });
    expect(to).toHaveBeenCalledWith(['user:acc-1', 'user:acc-2']);
    expect(emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ conversationId: 'conv-1' }));
  });
});

describe('MessagingGateway.notifyUnreadChanged (BE-RT1 — F-5 realtime)', () => {
  it('emits unread:changed to ONLY the recipient own user room', () => {
    const { gateway } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    gateway.notifyUnreadChanged('acc-9');
    expect(to).toHaveBeenCalledWith('user:acc-9');
    expect(emit).toHaveBeenCalledWith('unread:changed');
  });

  it('is a no-op (never throws) when the socket server is absent (e.g. worker context)', () => {
    const { gateway } = build();
    (gateway as unknown as { server: unknown }).server = undefined;
    expect(() => gateway.notifyUnreadChanged('acc-9')).not.toThrow();
  });
});

// ─── MC-15: message actions fan out to the right audience ────────────────────────
describe('MessagingGateway message actions (MC-15)', () => {
  function withServer() {
    const { gateway } = build();
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    (gateway as unknown as { server: unknown }).server = { to };
    return { gateway, to, emit };
  }

  it('a normal conversation reaches its PARTICIPANTS user rooms', () => {
    const { gateway, to, emit } = withServer();
    gateway.emitMessageEdited(
      { salon: false, participantIds: ['acc-1', 'acc-2'] },
      { conversationId: 'conv-1', messageId: 'm-1', body: 'Corrigé', editedAt: 'x' },
    );
    expect(to).toHaveBeenCalledWith(['user:acc-1', 'user:acc-2']);
    expect(emit).toHaveBeenCalledWith('message:edited', expect.objectContaining({ messageId: 'm-1' }));
  });

  it('a SALON message reaches the public salon room (members AND previewers)', () => {
    const { gateway, to, emit } = withServer();
    gateway.emitMessageLiked(
      { salon: true, participantIds: ['acc-1'] },
      { conversationId: 'salon-conv', messageId: 'm-1', userId: 'acc-1', liked: true, likeCount: 2 },
    );
    expect(to).toHaveBeenCalledWith(['salon']);
    expect(emit).toHaveBeenCalledWith('message:liked', expect.objectContaining({ likeCount: 2 }));
  });

  it('emits message:deleted so open threads drop the bubble live', () => {
    const { gateway, emit } = withServer();
    gateway.emitMessageDeleted({ salon: false, participantIds: ['acc-1'] }, { conversationId: 'c', messageId: 'm' });
    expect(emit).toHaveBeenCalledWith('message:deleted', { conversationId: 'c', messageId: 'm' });
  });

  it('is a no-op without a socket server (worker context) and with nobody to reach', () => {
    const { gateway } = build();
    expect(() =>
      gateway.emitMessageDeleted({ salon: false, participantIds: ['acc-1'] }, { conversationId: 'c', messageId: 'm' }),
    ).not.toThrow();

    const withEmpty = withServer();
    withEmpty.gateway.emitMessageDeleted({ salon: false, participantIds: [] }, { conversationId: 'c', messageId: 'm' });
    expect(withEmpty.to).not.toHaveBeenCalled();
  });
});
