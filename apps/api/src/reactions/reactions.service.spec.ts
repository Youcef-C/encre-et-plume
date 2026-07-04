import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReactionsService } from './reactions.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Interactive $transaction mock (mirrors account-erasure.processor.spec.ts's tx pattern):
 * $transaction just invokes the callback with a `tx` object exposing the same model methods.
 */
function makeModel(overrides: Record<string, jest.Mock> = {}) {
  return {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 1 }), // default: a fresh (non-duplicate) insert
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['accountId_workId'] },
  });
}

/** Postgres 25P02 — thrown by every statement issued after one has already failed on the same tx. */
class AbortedTransactionError extends Error {
  constructor() {
    super('current transaction is aborted, commands ignored until end of transaction block (25P02)');
  }
}

/**
 * Simulates REAL interactive-transaction abort semantics: once ANY statement on this tx throws,
 * every subsequent statement on the SAME tx throws too (Postgres 25P02) — unlike the plain
 * passthrough `tx` built in `beforeEach` above, where every jest mock resolves/rejects
 * independently and so cannot catch a "query issued after a caught error, same transaction" bug
 * (exactly what the reviewer reproduced live against :5433 — B1).
 */
function makeAbortableTx(fns: Record<string, Record<string, (...args: unknown[]) => unknown>>) {
  let aborted = false;
  const tx: Record<string, Record<string, jest.Mock>> = {};
  for (const [model, methods] of Object.entries(fns)) {
    tx[model] = {};
    for (const [name, impl] of Object.entries(methods)) {
      tx[model][name] = jest.fn(async (...args: unknown[]) => {
        if (aborted) throw new AbortedTransactionError();
        try {
          return await impl(...args);
        } catch (err) {
          aborted = true;
          throw err;
        }
      });
    }
  }
  return tx;
}

describe('ReactionsService', () => {
  let service: ReactionsService;
  let tx: {
    work: ReturnType<typeof makeModel>;
    chapter: ReturnType<typeof makeModel>;
    illustration: ReturnType<typeof makeModel>;
    favorite: ReturnType<typeof makeModel>;
    watchlistItem: ReturnType<typeof makeModel>;
    reaction: ReturnType<typeof makeModel>;
  };
  let prisma: { $transaction: jest.Mock; reaction: ReturnType<typeof makeModel>; favorite: ReturnType<typeof makeModel>; watchlistItem: ReturnType<typeof makeModel> };

  beforeEach(() => {
    tx = {
      work: makeModel(),
      chapter: makeModel(),
      illustration: makeModel(),
      favorite: makeModel(),
      watchlistItem: makeModel(),
      reaction: makeModel(),
    };
    prisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      reaction: makeModel(),
      favorite: makeModel(),
      watchlistItem: makeModel(),
    };
    service = new ReactionsService(prisma as unknown as PrismaService);
  });

  describe('toggle — work', () => {
    it('POST like work creates a Favorite and increments Work.likeCount', async () => {
      tx.work.findUnique.mockResolvedValue({ id: 'work-1', likeCount: 10, favoriteCount: 2 });
      tx.work.update.mockResolvedValue({ likeCount: 11 });

      const result = await service.toggle('acc-1', 'like', true, { targetType: 'work', targetId: 'lames-de-brume' });

      expect(tx.work.findUnique).toHaveBeenCalledWith({ where: { slug: 'lames-de-brume' }, select: { id: true, likeCount: true, favoriteCount: true } });
      expect(tx.favorite.create).toHaveBeenCalledWith({ data: { accountId: 'acc-1', workId: 'work-1' } });
      expect(tx.work.update).toHaveBeenCalledWith({ where: { id: 'work-1' }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      expect(result).toEqual({ active: true, count: 11 });
    });

    it('POST like work when a Favorite already exists (P2002) is a no-op returning current count', async () => {
      tx.work.findUnique.mockResolvedValue({ id: 'work-1', likeCount: 10, favoriteCount: 2 });
      tx.favorite.create.mockRejectedValue(uniqueViolation());

      const result = await service.toggle('acc-1', 'like', true, { targetType: 'work', targetId: 'lames-de-brume' });

      expect(tx.work.update).not.toHaveBeenCalled();
      expect(result).toEqual({ active: true, count: 10 });
    });

    it('DELETE like work deletes the Favorite and decrements likeCount', async () => {
      tx.work.findUnique.mockResolvedValue({ id: 'work-1', likeCount: 10, favoriteCount: 2 });
      tx.favorite.deleteMany.mockResolvedValue({ count: 1 });
      tx.work.update.mockResolvedValue({ likeCount: 9 });

      const result = await service.toggle('acc-1', 'like', false, { targetType: 'work', targetId: 'lames-de-brume' });

      expect(tx.favorite.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'acc-1', workId: 'work-1' } });
      expect(tx.work.update).toHaveBeenCalledWith({ where: { id: 'work-1' }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } });
      expect(result).toEqual({ active: false, count: 9 });
    });

    it('DELETE like work when absent (deleteMany count 0) is a no-op returning current count', async () => {
      tx.work.findUnique.mockResolvedValue({ id: 'work-1', likeCount: 10, favoriteCount: 2 });
      tx.favorite.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.toggle('acc-1', 'like', false, { targetType: 'work', targetId: 'lames-de-brume' });

      expect(tx.work.update).not.toHaveBeenCalled();
      expect(result).toEqual({ active: false, count: 10 });
    });

    it('POST save work creates a WatchlistItem and increments Work.favoriteCount', async () => {
      tx.work.findUnique.mockResolvedValue({ id: 'work-1', likeCount: 10, favoriteCount: 2 });
      tx.work.update.mockResolvedValue({ favoriteCount: 3 });

      const result = await service.toggle('acc-1', 'save', true, { targetType: 'work', targetId: 'lames-de-brume' });

      expect(tx.watchlistItem.create).toHaveBeenCalledWith({ data: { accountId: 'acc-1', workId: 'work-1' } });
      expect(tx.work.update).toHaveBeenCalledWith({ where: { id: 'work-1' }, data: { favoriteCount: { increment: 1 } }, select: { favoriteCount: true } });
      expect(result).toEqual({ active: true, count: 3 });
    });

    it('throws NotFoundException when the work slug does not resolve', async () => {
      tx.work.findUnique.mockResolvedValue(null);

      await expect(
        service.toggle('acc-1', 'like', true, { targetType: 'work', targetId: 'introuvable' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggle — chapter', () => {
    it('POST like chapter creates a Reaction and bumps Chapter.likeCount', async () => {
      tx.chapter.findUnique.mockResolvedValue({ id: 'ch-1', likeCount: 5 });
      tx.chapter.update.mockResolvedValue({ likeCount: 6 });

      const result = await service.toggle('acc-1', 'like', true, { targetType: 'chapter', targetId: 'ch-1' });

      expect(tx.chapter.findUnique).toHaveBeenCalledWith({ where: { id: 'ch-1' }, select: { id: true, likeCount: true } });
      expect(tx.reaction.createMany).toHaveBeenCalledWith({
        data: [{ accountId: 'acc-1', targetType: 'chapter', targetId: 'ch-1', kind: 'like' }],
        skipDuplicates: true,
      });
      expect(tx.chapter.update).toHaveBeenCalledWith({ where: { id: 'ch-1' }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      expect(result).toEqual({ active: true, count: 6 });
    });

    it('DELETE like chapter decrements Chapter.likeCount', async () => {
      tx.chapter.findUnique.mockResolvedValue({ id: 'ch-1', likeCount: 5 });
      tx.reaction.deleteMany.mockResolvedValue({ count: 1 });
      tx.chapter.update.mockResolvedValue({ likeCount: 4 });

      const result = await service.toggle('acc-1', 'like', false, { targetType: 'chapter', targetId: 'ch-1' });

      expect(tx.reaction.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'acc-1', targetType: 'chapter', targetId: 'ch-1', kind: 'like' } });
      expect(result).toEqual({ active: false, count: 4 });
    });

    it('throws NotFoundException when the chapter id does not resolve', async () => {
      tx.chapter.findUnique.mockResolvedValue(null);

      await expect(
        service.toggle('acc-1', 'like', true, { targetType: 'chapter', targetId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggle — illustration', () => {
    it('POST like illustration creates a Reaction and bumps Illustration.likeCount', async () => {
      tx.illustration.findUnique.mockResolvedValue({ id: 'illus-1', likeCount: 100 });
      tx.illustration.update.mockResolvedValue({ likeCount: 101 });

      const result = await service.toggle('acc-1', 'like', true, { targetType: 'illustration', targetId: 'illus-1' });

      expect(tx.illustration.update).toHaveBeenCalledWith({ where: { id: 'illus-1' }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      expect(result).toEqual({ active: true, count: 101 });
    });

    it('POST save illustration creates a Reaction with no counter column, count = reaction.count(save)', async () => {
      tx.illustration.findUnique.mockResolvedValue({ id: 'illus-1', likeCount: 100 });
      tx.reaction.count.mockResolvedValue(1);

      const result = await service.toggle('acc-1', 'save', true, { targetType: 'illustration', targetId: 'illus-1' });

      expect(tx.reaction.createMany).toHaveBeenCalledWith({
        data: [{ accountId: 'acc-1', targetType: 'illustration', targetId: 'illus-1', kind: 'save' }],
        skipDuplicates: true,
      });
      expect(tx.illustration.update).not.toHaveBeenCalled();
      expect(tx.reaction.count).toHaveBeenCalledWith({ where: { targetType: 'illustration', targetId: 'illus-1', kind: 'save' } });
      expect(result).toEqual({ active: true, count: 1 });
    });

    it('DELETE save illustration when absent is a no-op returning the current reaction count', async () => {
      tx.illustration.findUnique.mockResolvedValue({ id: 'illus-1', likeCount: 100 });
      tx.reaction.deleteMany.mockResolvedValue({ count: 0 });
      tx.reaction.count.mockResolvedValue(0);

      const result = await service.toggle('acc-1', 'save', false, { targetType: 'illustration', targetId: 'illus-1' });

      expect(result).toEqual({ active: false, count: 0 });
    });

    it('throws NotFoundException when the illustration id does not resolve', async () => {
      tx.illustration.findUnique.mockResolvedValue(null);

      await expect(
        service.toggle('acc-1', 'like', true, { targetType: 'illustration', targetId: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggle — unknown targetType', () => {
    it('throws NotFoundException', async () => {
      await expect(
        service.toggle('acc-1', 'like', true, { targetType: 'bogus' as never, targetId: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toggle — idempotent double-POST under REAL aborted-transaction semantics (B1 regression)', () => {
    it('POST save illustration when already active is a no-op returning current count (not a 500)', async () => {
      const abortableTx = makeAbortableTx({
        illustration: { findUnique: async () => ({ id: 'illus-1', likeCount: 100 }) },
        reaction: {
          // createMany({skipDuplicates:true}) never throws P2002 — insertedCount:0 IS the signal
          // that the row already existed (simulates the second of two concurrent/repeat POSTs).
          createMany: async () => ({ count: 0 }),
          count: async () => 1,
        },
      });
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(abortableTx));

      const result = await service.toggle('acc-1', 'save', true, { targetType: 'illustration', targetId: 'illus-1' });

      expect(result).toEqual({ active: true, count: 1 });
    });

    it('POST like chapter when already active is a no-op returning current count (pre-read, no post-write query)', async () => {
      const abortableTx = makeAbortableTx({
        chapter: { findUnique: async () => ({ id: 'ch-1', likeCount: 5 }) },
        reaction: {
          createMany: async () => ({ count: 0 }),
          // Must NOT be called: the `like` (hasCounter) branch returns the pre-read entity.likeCount.
          count: async () => {
            throw new Error('reaction.count() must not run — chapter+like returns the pre-read likeCount');
          },
        },
      });
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(abortableTx));

      const result = await service.toggle('acc-1', 'like', true, { targetType: 'chapter', targetId: 'ch-1' });

      expect(result).toEqual({ active: true, count: 5 });
    });

    it('POST save illustration for a genuinely NEW row still increments correctly (createMany count:1 path)', async () => {
      const abortableTx = makeAbortableTx({
        illustration: { findUnique: async () => ({ id: 'illus-1', likeCount: 100 }) },
        reaction: {
          createMany: async () => ({ count: 1 }),
          count: async () => 1,
        },
      });
      prisma.$transaction = jest.fn(async (cb: (tx: unknown) => unknown) => cb(abortableTx));

      const result = await service.toggle('acc-1', 'save', true, { targetType: 'illustration', targetId: 'illus-1' });

      expect(result).toEqual({ active: true, count: 1 });
    });
  });

  describe('getState', () => {
    it('work: returns liked/saved true only for ids the account reacted to', async () => {
      prisma.favorite.findMany.mockResolvedValue([{ work: { slug: 'lames-de-brume' } }]);
      prisma.watchlistItem.findMany.mockResolvedValue([{ work: { slug: 'onibi' } }]);

      const result = await service.getState('acc-1', 'work', ['lames-de-brume', 'onibi', 'vertige']);

      expect(result).toEqual({
        'lames-de-brume': { liked: true, saved: false },
        onibi: { liked: false, saved: true },
        vertige: { liked: false, saved: false },
      });
    });

    it('chapter/illustration: builds liked/saved from Reaction rows', async () => {
      const reactionFindMany = jest.fn().mockResolvedValue([
        { targetId: 'ch-1', kind: 'like' },
        { targetId: 'ch-2', kind: 'save' },
      ]);
      prisma.reaction.findMany = reactionFindMany;

      const result = await service.getState('acc-1', 'chapter', ['ch-1', 'ch-2', 'ch-3']);

      expect(reactionFindMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', targetType: 'chapter', targetId: { in: ['ch-1', 'ch-2', 'ch-3'] } },
        select: { targetId: true, kind: true },
      });
      expect(result).toEqual({
        'ch-1': { liked: true, saved: false },
        'ch-2': { liked: false, saved: true },
        'ch-3': { liked: false, saved: false },
      });
    });

    it('returns {} for an empty ids array (no query)', async () => {
      const result = await service.getState('acc-1', 'work', []);
      expect(result).toEqual({});
      expect(prisma.favorite.findMany).not.toHaveBeenCalled();
    });
  });
});
