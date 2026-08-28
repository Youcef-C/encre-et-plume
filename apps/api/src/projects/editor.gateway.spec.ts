import { EditorGateway } from './editor.gateway';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';
import type { RedisService } from '../redis/redis.service';

function makeSocket(cookie?: string) {
  return {
    id: 'sock-1',
    handshake: { headers: { cookie, 'user-agent': 'jest' }, address: '127.0.0.1' },
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    disconnect: jest.fn(),
  };
}

const MEMBER_PAGE = {
  id: 'page-1',
  projectId: 'proj-1',
  project: {
    ownerId: 'acc-me',
    work: {
      creators: [
        { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
        // CS-10: a plain member whose « Écriture » toggle is off → read-only editor.
        { accountId: 'acc-reader', groupRole: 'member', permissions: ['corrections'] },
        { accountId: 'acc-writer', groupRole: 'member', permissions: ['ecriture'] },
      ],
    },
  },
};

function build(over: { prisma?: any; jwt?: any; redis?: any } = {}) {
  const jwt = over.jwt ?? { verify: jest.fn().mockReturnValue({ sub: 'acc-me', jti: 'tok-1', exp: 9e9, iat: 1 }) };
  const redis = over.redis ?? { getOrThrow: jest.fn().mockResolvedValue(null) };
  const prisma = over.prisma ?? {
    page: { findUnique: jest.fn().mockResolvedValue(MEMBER_PAGE) },
    assetPageLink: { findFirst: jest.fn().mockResolvedValue(null) },
    asset: { findFirst: jest.fn().mockResolvedValue(null) },
    scenarioDocument: { findUnique: jest.fn().mockResolvedValue(null) },
    scenarioUpdate: { create: jest.fn().mockResolvedValue({}) },
  };
  const gateway = new EditorGateway(jwt as unknown as JwtService, redis as unknown as RedisService, prisma as unknown as PrismaService);
  return { gateway, jwt, redis, prisma };
}

/** Attach a fake socket.io server that records room emits. */
function serverOf(gateway: EditorGateway, peers = 1) {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const fetchSockets = jest.fn().mockResolvedValue(new Array(peers).fill({}));
  (gateway as unknown as { server: unknown }).server = { to, in: jest.fn().mockReturnValue({ fetchSockets }) };
  return { emit, to };
}

// Regression (QA, 2026-07-15): the OLD `handleConnection` (an `OnGatewayConnection` lifecycle hook) is
// NOT awaited by Socket.IO before the SAME socket's first message is dispatched — the client emits
// `editor:join` immediately on 'connect' (lib/editor-collab.ts), which can reach `handleJoin` BEFORE
// this async handler finishes setting `socket.data.accountId`, silently dropping the join forever (no
// client-side retry) — reproduced live via a two-context Playwright test staying stuck at "1 en ligne"
// for 60s+. Socket.IO connection MIDDLEWARE (`server.use(...)`, wired in `afterInit`) IS awaited before
// 'connection'/any message fires for that socket, closing the race at its source.
describe('EditorGateway.authenticate (Socket.IO connection middleware, fail closed)', () => {
  it('rejects a handshake with no cookie via next(error) — the socket never reaches "connection"', async () => {
    const { gateway } = build();
    const socket = makeSocket(undefined);
    const next = jest.fn();
    await gateway.authenticate(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data['accountId']).toBeUndefined();
  });

  it('rejects when session verification throws (Redis outage) — fails closed', async () => {
    const jwt = { verify: jest.fn(() => { throw new Error('boom'); }) };
    const { gateway } = build({ jwt });
    const socket = makeSocket('ep_session=good');
    const next = jest.fn();
    await gateway.authenticate(socket as never, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.data['accountId']).toBeUndefined();
  });

  it('stores accountId and calls next() with no error for a valid handshake', async () => {
    const { gateway } = build();
    const socket = makeSocket('ep_session=good');
    const next = jest.fn();
    await gateway.authenticate(socket as never, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data['accountId']).toBe('acc-me');
  });
});

describe('EditorGateway.handleJoin (membership-gated)', () => {
  it('a non-member never joins the room', async () => {
    const prisma = {
      page: { findUnique: jest.fn().mockResolvedValue(MEMBER_PAGE) },
      assetPageLink: { findFirst: jest.fn().mockResolvedValue(null) },
      scenarioDocument: { findUnique: jest.fn() },
    };
    const { gateway } = build({ prisma });
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'stranger';
    await gateway.handleJoin(socket as never, { pageId: 'page-1' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins the page room pre-materialization and syncs a null state', async () => {
    const { gateway } = build();
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    await gateway.handleJoin(socket as never, { pageId: 'page-1' });
    expect(socket.join).toHaveBeenCalledWith('editor:page:page-1');
    expect(socket.emit).toHaveBeenCalledWith('editor:sync', expect.objectContaining({ ydocState: null, updates: [] }));
  });

  // B-I2 (D9): explicit assetId join — open a CHOSEN scenario/texte asset room.
  it('joins the chosen asset room when a valid ?assetId is given', async () => {
    const prisma = {
      page: { findUnique: jest.fn().mockResolvedValue(MEMBER_PAGE) },
      assetPageLink: { findFirst: jest.fn().mockResolvedValue(null) },
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'asset-chosen' }) },
      scenarioDocument: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const { gateway } = build({ prisma });
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    await gateway.handleJoin(socket as never, { pageId: 'page-1', assetId: 'asset-chosen' });
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'asset-chosen', projectId: 'proj-1', type: { in: ['scenario', 'texte'] } }) }),
    );
    expect(socket.join).toHaveBeenCalledWith('editor:asset:asset-chosen');
  });

  it('never joins a room for a foreign / wrong-type assetId', async () => {
    const prisma = {
      page: { findUnique: jest.fn().mockResolvedValue(MEMBER_PAGE) },
      assetPageLink: { findFirst: jest.fn().mockResolvedValue(null) },
      asset: { findFirst: jest.fn().mockResolvedValue(null) }, // scoped where excludes it → invalid
      scenarioDocument: { findUnique: jest.fn() },
    };
    const { gateway } = build({ prisma });
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    await gateway.handleJoin(socket as never, { pageId: 'page-1', assetId: 'asset-foreign' });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('joins the asset room + syncs persisted state when materialized', async () => {
    const prisma = {
      page: { findUnique: jest.fn().mockResolvedValue(MEMBER_PAGE) },
      assetPageLink: { findFirst: jest.fn().mockResolvedValue({ asset: { id: 'asset-1' } }) },
      scenarioDocument: {
        findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', ydocState: Buffer.from('yjs'), updates: [{ update: Buffer.from('u1') }] }),
      },
    };
    const { gateway } = build({ prisma });
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    await gateway.handleJoin(socket as never, { pageId: 'page-1' });
    expect(socket.join).toHaveBeenCalledWith('editor:asset:asset-1');
    expect(socket.emit).toHaveBeenCalledWith(
      'editor:sync',
      expect.objectContaining({ ydocState: Buffer.from('yjs').toString('base64'), updates: [Buffer.from('u1').toString('base64')] }),
    );
  });
});

// CS-10 — the group « Écriture » permission gates the collaborative editor server-side.
describe('EditorGateway write permission (CS-10)', () => {
  it('syncs canWrite:true for a leader / owner', async () => {
    const { gateway } = build();
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    await gateway.handleJoin(socket as never, { pageId: 'page-1' });
    expect(socket.emit).toHaveBeenCalledWith('editor:sync', expect.objectContaining({ canWrite: true }));
    expect(socket.data['canWrite']).toBe(true);
  });

  it('syncs canWrite:false for a member without the écriture toggle', async () => {
    const { gateway } = build();
    serverOf(gateway);
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-reader';
    await gateway.handleJoin(socket as never, { pageId: 'page-1' });
    expect(socket.emit).toHaveBeenCalledWith('editor:sync', expect.objectContaining({ canWrite: false }));
    expect(socket.data['canWrite']).toBe(false);
  });

  it('drops an update from a read-only socket: no relay, no persist', async () => {
    const { gateway, prisma } = build();
    (prisma.scenarioDocument.findUnique as jest.Mock).mockResolvedValue({ id: 'doc-1' });
    const toRet = { emit: jest.fn() };
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-reader';
    socket.data['editorRoom'] = 'editor:asset:asset-1';
    socket.data['canWrite'] = false;
    socket.to.mockReturnValue(toRet);
    await gateway.handleUpdate(socket as never, { u: 'AA==' });
    await new Promise((r) => setImmediate(r));
    expect(toRet.emit).not.toHaveBeenCalled();
    expect(prisma.scenarioUpdate.create).not.toHaveBeenCalled();
  });

  it('still relays awareness (presence/cursors) from a read-only socket', () => {
    const { gateway } = build();
    const toRet = { emit: jest.fn() };
    const socket = makeSocket('ep_session=good');
    socket.data['editorRoom'] = 'editor:asset:asset-1';
    socket.data['canWrite'] = false;
    socket.to.mockReturnValue(toRet);
    gateway.handleAwareness(socket as never, { a: 'BB==' });
    expect(toRet.emit).toHaveBeenCalledWith('editor:awareness', { a: 'BB==' });
  });
});

describe('EditorGateway relays (opaque)', () => {
  function joinedSocket(room: string) {
    const toRet = { emit: jest.fn() };
    const socket = makeSocket('ep_session=good');
    socket.data['accountId'] = 'acc-me';
    socket.data['editorRoom'] = room;
    socket.to.mockReturnValue(toRet);
    return { socket, toEmit: toRet.emit };
  }

  it('relays editor:update to the room excluding the sender + appends when materialized', async () => {
    const { gateway, prisma } = build();
    (prisma.scenarioDocument.findUnique as jest.Mock).mockResolvedValue({ id: 'doc-1' });
    const { socket, toEmit } = joinedSocket('editor:asset:asset-1');
    await gateway.handleUpdate(socket as never, { u: 'AA==' });
    expect(socket.to).toHaveBeenCalledWith('editor:asset:asset-1');
    expect(toEmit).toHaveBeenCalledWith('editor:update', { u: 'AA==' });
    // fire-and-forget append — allow the microtask to flush
    await new Promise((r) => setImmediate(r));
    expect(prisma.scenarioUpdate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ documentId: 'doc-1' }) }));
  });

  it('relays editor:awareness verbatim without persisting', () => {
    const { gateway, prisma } = build();
    const { socket, toEmit } = joinedSocket('editor:asset:asset-1');
    gateway.handleAwareness(socket as never, { a: 'BB==' });
    expect(toEmit).toHaveBeenCalledWith('editor:awareness', { a: 'BB==' });
    expect(prisma.scenarioUpdate.create).not.toHaveBeenCalled();
  });

  it('does not append updates in the pre-materialization page room', async () => {
    const { gateway, prisma } = build();
    const { socket } = joinedSocket('editor:page:page-1');
    await gateway.handleUpdate(socket as never, { u: 'AA==' });
    await new Promise((r) => setImmediate(r));
    expect(prisma.scenarioUpdate.create).not.toHaveBeenCalled();
  });
});

describe('EditorGateway broadcasts', () => {
  it('emitMaterialized broadcasts to the page room', () => {
    const { gateway } = build();
    const { emit, to } = serverOf(gateway);
    gateway.emitMaterialized('page-1', 'asset-1');
    expect(to).toHaveBeenCalledWith('editor:page:page-1');
    expect(emit).toHaveBeenCalledWith('editor:materialized', { assetId: 'asset-1' });
  });

  it('emitComment broadcasts to the asset room', () => {
    const { gateway } = build();
    const { emit, to } = serverOf(gateway);
    // CS-22 — the relative anchors ride this same broadcast verbatim (the gateway relays the DTO whole).
    const comment = { id: 'c1', caseNo: 1, authorId: 'a', authorName: 'A', text: 'x', createdAt: 'x', anchorFrom: 3, anchorTo: 9, quote: 'q', anchorRelFrom: 'AQID', anchorRelTo: 'BAUG', version: null, correction: null };
    gateway.emitComment('asset-1', comment);
    expect(to).toHaveBeenCalledWith('editor:asset:asset-1');
    expect(emit).toHaveBeenCalledWith('editor:comment', { comment });
  });

  // CS-15 — author-only delete fan-out.
  it('emitCommentDeleted broadcasts { id } to the asset room', () => {
    const { gateway } = build();
    const { emit, to } = serverOf(gateway);
    gateway.emitCommentDeleted('asset-1', 'cmt-1');
    expect(to).toHaveBeenCalledWith('editor:asset:asset-1');
    expect(emit).toHaveBeenCalledWith('editor:comment-deleted', { id: 'cmt-1' });
  });

  it('both are no-ops (never throw) with no socket server (worker context)', () => {
    const { gateway } = build();
    (gateway as unknown as { server: unknown }).server = undefined;
    expect(() => gateway.emitMaterialized('p', 'a')).not.toThrow();
    expect(() => gateway.emitComment('a', { id: 'c', caseNo: 1, authorId: 'a', authorName: 'A', text: 'x', createdAt: 'x', anchorFrom: null, anchorTo: null, quote: null, anchorRelFrom: null, anchorRelTo: null, version: null, correction: null })).not.toThrow();
    expect(() => gateway.emitCommentDeleted('a', 'c')).not.toThrow();
  });
});
