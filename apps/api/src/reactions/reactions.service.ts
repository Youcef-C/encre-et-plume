import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReactionKind, ReactionStateResponse, ReactionTargetType, ReactionToggleRequest, ReactionToggleResponse } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ponytail: interactive-transaction row model shape covering just what toggle() needs from
// each Prisma delegate (create/deleteMany/update/count) — narrower than the full PrismaClient,
// mirrors account-erasure.processor.ts's `tx as typeof this.prisma` narrowing. The concrete Prisma
// delegates (Favorite/WatchlistItem/Chapter/Illustration) each have incompatible generated arg
// types, so the shared helper below deliberately narrows to `any` at the call boundary — same
// bridge pattern the account-erasure processor uses per-model, generalized to be reused by both
// counter targets (work-like/work-save) instead of duplicated per model.
type CounterRowModel = {
  create: (args: { data: Record<string, string> }) => Promise<unknown>;
  deleteMany: (args: { where: Record<string, string> }) => Promise<{ count: number }>;
};
type CounterEntityModel = {
  update: (args: { where: { id: string }; data: Record<string, unknown>; select: Record<string, boolean> }) => Promise<Record<string, number>>;
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * DR-9 — unified like/save toggle. R1 (plan): works reuse Favorite (like) / WatchlistItem (save) so
 * DR-8's read endpoints keep working unchanged (no dual-write); chapter/illustration have no per-user
 * table, so they route through the generic Reaction row. Every write happens inside one interactive
 * $transaction so the per-user row and the denormalized counter can never drift from each other
 * (concurrent-toggle safety) and idempotent POST/DELETE never double-count.
 */
@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async toggle(accountId: string, kind: ReactionKind, on: boolean, target: ReactionToggleRequest): Promise<ReactionToggleResponse> {
    const res = await this.prisma.$transaction(async (tx) => {
      const t = tx as unknown as typeof this.prisma;

      if (target.targetType === 'work') {
        const work = await t.work.findUnique({ where: { slug: target.targetId }, select: { id: true, likeCount: true, favoriteCount: true } });
        if (!work) throw new NotFoundException('Cible introuvable');

        return kind === 'like'
          ? this.toggleCounterRow(
              t.favorite as unknown as CounterRowModel,
              t.work as unknown as CounterEntityModel,
              { accountId, workId: work.id },
              work.id,
              'likeCount',
              work.likeCount,
              on,
            )
          : this.toggleCounterRow(
              t.watchlistItem as unknown as CounterRowModel,
              t.work as unknown as CounterEntityModel,
              { accountId, workId: work.id },
              work.id,
              'favoriteCount',
              work.favoriteCount,
              on,
            );
      }

      if (target.targetType === 'chapter' || target.targetType === 'illustration') {
        return this.toggleReaction(t, accountId, kind, on, target.targetType, target.targetId);
      }

      throw new NotFoundException('Cible introuvable');
    });

    // Reflect the new like/favorite count in the cached lists immediately (a like on the detail page
    // must show on the Galerie/Catalogue on next fetch, not at the 60s TTL).
    // ponytail: this drops the whole list-cache namespace on every toggle — fine at current scale;
    // if like throughput dominates, move likeCount out of the cached payload or use a per-row cache.
    if (target.targetType === 'illustration') {
      await this.redis.delByPattern('gallery:list:*');
    } else if (target.targetType === 'work') {
      await this.redis.del(`work:${target.targetId}`);
      await this.redis.delByPattern('catalog:list:*');
      await this.redis.delByPattern('collections:list:*'); // collections are Illustration(s) Works
    }
    return res;
  }

  async getState(accountId: string, targetType: ReactionTargetType, ids: string[]): Promise<ReactionStateResponse> {
    if (ids.length === 0) return {};

    if (targetType === 'work') {
      const [favorites, watchlist] = await Promise.all([
        this.prisma.favorite.findMany({ where: { accountId, work: { slug: { in: ids } } }, select: { work: { select: { slug: true } } } }),
        this.prisma.watchlistItem.findMany({ where: { accountId, work: { slug: { in: ids } } }, select: { work: { select: { slug: true } } } }),
      ]);
      const likedSlugs = new Set(favorites.map((f) => f.work.slug));
      const savedSlugs = new Set(watchlist.map((w) => w.work.slug));
      const result: ReactionStateResponse = {};
      for (const id of ids) result[id] = { liked: likedSlugs.has(id), saved: savedSlugs.has(id) };
      return result;
    }

    const rows = await this.prisma.reaction.findMany({
      where: { accountId, targetType, targetId: { in: ids } },
      select: { targetId: true, kind: true },
    });
    const result: ReactionStateResponse = {};
    for (const id of ids) result[id] = { liked: false, saved: false };
    for (const row of rows) {
      const entry = result[row.targetId];
      if (!entry) continue;
      if (row.kind === 'like') entry.liked = true;
      else entry.saved = true;
    }
    return result;
  }

  /** work + like/save: create/delete the unique per-user row, maintain the Work counter column. */
  private async toggleCounterRow(
    rowModel: CounterRowModel,
    counterModel: CounterEntityModel,
    uniqueWhere: Record<string, string>,
    entityId: string,
    counterField: string,
    currentCount: number,
    on: boolean,
  ): Promise<ReactionToggleResponse> {
    if (on) {
      try {
        await rowModel.create({ data: uniqueWhere });
      } catch (err) {
        if (isUniqueViolation(err)) return { active: true, count: currentCount };
        throw err;
      }
      const updated = await counterModel.update({ where: { id: entityId }, data: { [counterField]: { increment: 1 } }, select: { [counterField]: true } });
      return { active: true, count: updated[counterField] };
    }

    const { count: deletedCount } = await rowModel.deleteMany({ where: uniqueWhere });
    if (deletedCount === 0) return { active: false, count: currentCount };
    const updated = await counterModel.update({ where: { id: entityId }, data: { [counterField]: { decrement: 1 } }, select: { [counterField]: true } });
    return { active: false, count: updated[counterField] };
  }

  /** chapter/illustration + like/save: generic Reaction row; `save` has no counter column (count()). */
  private async toggleReaction(
    tx: typeof this.prisma,
    accountId: string,
    kind: ReactionKind,
    on: boolean,
    targetType: 'chapter' | 'illustration',
    targetId: string,
  ): Promise<ReactionToggleResponse> {
    const entity =
      targetType === 'chapter'
        ? await tx.chapter.findUnique({ where: { id: targetId }, select: { id: true, likeCount: true } })
        : await tx.illustration.findUnique({ where: { id: targetId }, select: { id: true, likeCount: true } });
    if (!entity) throw new NotFoundException('Cible introuvable');

    const hasCounter = kind === 'like'; // illustration/chapter `save` has no counter column
    const where = { accountId, targetType, targetId, kind };
    const counterModel = (targetType === 'chapter' ? tx.chapter : tx.illustration) as unknown as CounterEntityModel;
    const currentReactionCount = async () => tx.reaction.count({ where: { targetType, targetId, kind } });

    if (on) {
      // ponytail: createMany({skipDuplicates:true}) never throws P2002 (unlike create()), so the
      // transaction is never left aborted — insertedCount===0 IS the idempotent-no-op signal.
      // (Root-cause fix for B1: create()+catch(P2002) here used to run a *second* query
      // (currentReactionCount()) on the same tx after Postgres had already aborted it on the
      // failed INSERT — Postgres 25P02 on every statement after the first error, surfacing as a
      // 500 instead of the idempotent {active,count}. No query may ever follow a caught write
      // error on the same transaction; createMany sidesteps the error entirely.)
      const { count: insertedCount } = await tx.reaction.createMany({ data: [where], skipDuplicates: true });
      if (insertedCount === 0) return { active: true, count: hasCounter ? entity.likeCount : await currentReactionCount() };
      if (!hasCounter) return { active: true, count: await currentReactionCount() };
      const updated = await counterModel.update({ where: { id: entity.id }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      return { active: true, count: updated.likeCount };
    }

    const { count: deletedCount } = await tx.reaction.deleteMany({ where });
    if (deletedCount === 0) return { active: false, count: hasCounter ? entity.likeCount : await currentReactionCount() };
    if (!hasCounter) return { active: false, count: await currentReactionCount() };
    const updated = await counterModel.update({ where: { id: entity.id }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } });
    return { active: false, count: updated.likeCount };
  }
}
