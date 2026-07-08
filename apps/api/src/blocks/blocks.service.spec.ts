import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BlocksService } from './blocks.service';
import { PrismaService } from '../prisma/prisma.service';

const BLOCK = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'blk-1',
  blockerId: 'acc-a',
  blockedId: 'acc-b',
  kind: 'block',
  createdAt: new Date('2026-07-08T10:00:00.000Z'),
  ...o,
});

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function makePrisma() {
  return {
    account: { findFirst: jest.fn().mockResolvedValue({ id: 'acc-b', deletedAt: null }) },
    userBlock: {
      create: jest.fn().mockResolvedValue(BLOCK()),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    connection: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    workCreator: { findMany: jest.fn().mockResolvedValue([]) },
    illustration: { findMany: jest.fn().mockResolvedValue([]) },
    // array-form $transaction: resolve each op's mocked promise in order.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function build(prisma: ReturnType<typeof makePrisma>) {
  return new BlocksService(prisma as unknown as PrismaService);
}

describe('BlocksService.create', () => {
  it('rejects self-block with 400', async () => {
    const prisma = makePrisma();
    await expect(build(prisma).create('acc-a', { userId: 'acc-a', kind: 'block' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.userBlock.create).not.toHaveBeenCalled();
  });

  it('404s an unknown or deleted target', async () => {
    const prisma = makePrisma();
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(build(prisma).create('acc-a', { userId: 'ghost', kind: 'block' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a block and returns the DTO (blockedId → userId)', async () => {
    const prisma = makePrisma();
    const dto = await build(prisma).create('acc-a', { userId: 'acc-b', kind: 'block' });
    expect(dto).toEqual({ id: 'blk-1', userId: 'acc-b', kind: 'block', createdAt: '2026-07-08T10:00:00.000Z' });
  });

  it('block deletes the connection (accepted + pending) both directions in the same transaction', async () => {
    const prisma = makePrisma();
    await build(prisma).create('acc-a', { userId: 'acc-b', kind: 'block' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.connection.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { requesterId: 'acc-a', addresseeId: 'acc-b' },
          { requesterId: 'acc-b', addresseeId: 'acc-a' },
        ],
      },
    });
  });

  it('mute does NOT touch connections', async () => {
    const prisma = makePrisma();
    prisma.userBlock.create.mockResolvedValue(BLOCK({ kind: 'mute' }));
    await build(prisma).create('acc-a', { userId: 'acc-b', kind: 'mute' });
    expect(prisma.connection.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent: a P2002 re-create returns the existing row', async () => {
    const prisma = makePrisma();
    prisma.$transaction.mockRejectedValue(p2002());
    prisma.userBlock.findUnique.mockResolvedValue(BLOCK());
    const dto = await build(prisma).create('acc-a', { userId: 'acc-b', kind: 'block' });
    expect(dto.id).toBe('blk-1');
  });
});

describe('BlocksService.remove', () => {
  it('deletes the caller-owned row', async () => {
    const prisma = makePrisma();
    await expect(build(prisma).remove('acc-a', 'acc-b', 'block')).resolves.toBeUndefined();
    expect(prisma.userBlock.deleteMany).toHaveBeenCalledWith({
      where: { blockerId: 'acc-a', blockedId: 'acc-b', kind: 'block' },
    });
  });

  it('404s when no such row exists (no existence leak)', async () => {
    const prisma = makePrisma();
    prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });
    await expect(build(prisma).remove('acc-a', 'acc-b', 'block')).rejects.toThrow(NotFoundException);
  });
});

describe('BlocksService.list', () => {
  it('returns own rows only, joined with the target account', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([
      {
        ...BLOCK(),
        blocked: { id: 'acc-b', displayName: 'Bea', profileSlug: 'bea', avatar: null },
      },
    ]);
    const res = await build(prisma).list('acc-a');
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { blockerId: 'acc-a' } }),
    );
    expect(res.items).toEqual([
      { userId: 'acc-b', slug: 'bea', name: 'Bea', avatarUrl: null, kind: 'block', createdAt: '2026-07-08T10:00:00.000Z' },
    ]);
  });
});

describe('BlocksService.isBlockedPair', () => {
  it('is true when a block row exists in either direction', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findFirst.mockResolvedValue({ id: 'blk-1' });
    expect(await build(prisma).isBlockedPair('acc-a', 'acc-b')).toBe(true);
    expect(prisma.userBlock.findFirst).toHaveBeenCalledWith({
      where: {
        kind: 'block',
        OR: [
          { blockerId: 'acc-a', blockedId: 'acc-b' },
          { blockerId: 'acc-b', blockedId: 'acc-a' },
        ],
      },
      select: { id: true },
    });
  });

  it('is false when there is no block row (mute-only pair does not count)', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findFirst.mockResolvedValue(null);
    expect(await build(prisma).isBlockedPair('acc-a', 'acc-b')).toBe(false);
  });
});

describe('BlocksService.hiddenAuthorIds (symmetric for block — R2-B4)', () => {
  it('includes own block+mute targets AND reverse block rows, mapping each to the OTHER id', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'acc-a', blockedId: 'acc-b' }, // own row (block or mute) → other = b
      { blockerId: 'acc-c', blockedId: 'acc-a' }, // reverse block → other = c
    ]);
    const hidden = await build(prisma).hiddenAuthorIds('acc-a');
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'acc-a' }, // own block + mute
          { blockedId: 'acc-a', kind: 'block' }, // reverse block ONLY (reverse mute excluded)
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    expect([...hidden].sort()).toEqual(['acc-b', 'acc-c']);
  });

  it('scopes the reverse leg to kind:block so a reverse MUTE never hides the muter reviews', async () => {
    const prisma = makePrisma();
    await build(prisma).hiddenAuthorIds('acc-a');
    const where = prisma.userBlock.findMany.mock.calls[0][0].where as { OR: Array<Record<string, unknown>> };
    const reverseLeg = where.OR.find((c) => c['blockedId'] === 'acc-a');
    expect(reverseLeg).toEqual({ blockedId: 'acc-a', kind: 'block' });
  });
});

describe('BlocksService.pairFlags (directional block flags — R2-B1)', () => {
  it('derives both flags from block rows in either direction', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'viewer', blockedId: 'target' },
      { blockerId: 'target', blockedId: 'viewer' },
    ]);
    expect(await build(prisma).pairFlags('viewer', 'target')).toEqual({
      viewerHasBlocked: true,
      blockedByTarget: true,
    });
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
      where: {
        kind: 'block',
        OR: [
          { blockerId: 'viewer', blockedId: 'target' },
          { blockerId: 'target', blockedId: 'viewer' },
        ],
      },
      select: { blockerId: true },
    });
  });

  it('viewer blocked the target only', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'viewer', blockedId: 'target' }]);
    expect(await build(prisma).pairFlags('viewer', 'target')).toEqual({
      viewerHasBlocked: true,
      blockedByTarget: false,
    });
  });

  it('target blocked the viewer only', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'target', blockedId: 'viewer' }]);
    expect(await build(prisma).pairFlags('viewer', 'target')).toEqual({
      viewerHasBlocked: false,
      blockedByTarget: true,
    });
  });

  it('both false when no block rows', async () => {
    const prisma = makePrisma();
    expect(await build(prisma).pairFlags('viewer', 'target')).toEqual({
      viewerHasBlocked: false,
      blockedByTarget: false,
    });
  });
});

describe('BlocksService.hiddenContent (mutual content-hiding — B9)', () => {
  it('returns null (fast path) when the viewer has no block rows — no follow-up queries', async () => {
    const prisma = makePrisma();
    const hc = await build(prisma).hiddenContent('acc-a');
    expect(hc).toBeNull();
    expect(prisma.workCreator.findMany).not.toHaveBeenCalled();
    expect(prisma.illustration.findMany).not.toHaveBeenCalled();
  });

  it('collects accountIds both directions and resolves works (id+slug) + illustrations (id)', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: 'acc-a', blockedId: 'acc-b' }, // viewer blocked b → b
      { blockerId: 'acc-c', blockedId: 'acc-a' }, // c blocked viewer → c
    ]);
    prisma.workCreator.findMany.mockResolvedValue([
      { work: { id: 'w1', slug: 'oeuvre-b' } },
      { work: { id: 'w2', slug: 'oeuvre-c' } },
    ]);
    prisma.illustration.findMany.mockResolvedValue([{ id: 'ill1' }]);

    const hc = await build(prisma).hiddenContent('acc-a');
    expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
      where: { kind: 'block', OR: [{ blockerId: 'acc-a' }, { blockedId: 'acc-a' }] },
      select: { blockerId: true, blockedId: true },
    });
    expect([...hc!.accountIds].sort()).toEqual(['acc-b', 'acc-c']);
    expect(prisma.workCreator.findMany).toHaveBeenCalledWith({
      where: { accountId: { in: [...hc!.accountIds] } },
      select: { work: { select: { id: true, slug: true } } },
    });
    expect(prisma.illustration.findMany).toHaveBeenCalledWith({
      where: { artistId: { in: [...hc!.accountIds] } },
      select: { id: true },
    });
    expect([...hc!.workIds].sort()).toEqual(['w1', 'w2']);
    expect([...hc!.workSlugs].sort()).toEqual(['oeuvre-b', 'oeuvre-c']);
    expect([...hc!.illustrationIds]).toEqual(['ill1']);
  });

  it('hides a co-created work entirely when ANY creator is in the pair set', async () => {
    const prisma = makePrisma();
    prisma.userBlock.findMany.mockResolvedValue([{ blockerId: 'acc-a', blockedId: 'acc-b' }]);
    // b co-created w1 with a third party — the whole work is hidden.
    prisma.workCreator.findMany.mockResolvedValue([{ work: { id: 'w1', slug: 'co-created' } }]);
    const hc = await build(prisma).hiddenContent('acc-a');
    expect(hc!.workIds.has('w1')).toBe(true);
    expect(hc!.workSlugs.has('co-created')).toBe(true);
  });

  it('mute-only pair → null (mute never hides content)', async () => {
    const prisma = makePrisma();
    // the block-scoped query returns nothing because only a mute row exists.
    prisma.userBlock.findMany.mockResolvedValue([]);
    expect(await build(prisma).hiddenContent('acc-a')).toBeNull();
  });
});
