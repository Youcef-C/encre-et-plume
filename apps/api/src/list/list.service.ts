import { Injectable } from '@nestjs/common';
import type { ListItemDto, LikedWorkDto, LikedIllustrationDto } from '@encre-et-plume/shared';
import { galleryCategoryLabel } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

type WatchlistRow = {
  createdAt: Date;
  work: { id: string; slug: string; title: string; coverImage: string | null; chapterCount: number; format: string };
};

type ProgressRow = {
  workId: string;
  page: number;
  updatedAt: Date;
  chapter: { number: number };
};

type FavoriteRow = {
  createdAt: Date;
  work: { slug: string; title: string; coverImage: string | null; genre: string; likeCount: number; format: string };
};

type IllustrationReactionRow = { targetId: string };

type IllustrationRow = {
  id: string;
  title: string;
  artistName: string;
  category: string;
  image: string | null;
  likeCount: number;
};

/**
 * DR-8 — "Ma liste" (WatchlistItem) + "Coups de cœur" (reuses DR-4's Favorite) — read-only; DR-9's
 * ReactionsService owns both the add/remove writes (POST/DELETE /reactions/{save,like}) so there is a
 * single unsave/unlike implementation and the Work counters never drift (B5). Progress is joined
 * in-memory from DR-4's ReadingProgress, one query for the whole account (avoids N+1) — mirrors
 * DR-11's dedupe pattern.
 */
@Injectable()
export class ListService {
  constructor(private readonly prisma: PrismaService) {}

  async getList(accountId: string): Promise<ListItemDto[]> {
    const rows = (await this.prisma.watchlistItem.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: { work: { select: { id: true, slug: true, title: true, coverImage: true, chapterCount: true, format: true } } },
    })) as unknown as WatchlistRow[];

    if (rows.length === 0) return [];

    const progressRows = (await this.prisma.readingProgress.findMany({
      where: { accountId },
      orderBy: { updatedAt: 'desc' },
      include: { chapter: { select: { number: true } } },
    })) as unknown as ProgressRow[];

    // ponytail: in-memory dedupe (per-account volume — mirrors DR-11's readingHistoryService); rows
    // already ordered updatedAt desc, so the first row per workId is the latest.
    const latestByWork = new Map<string, ProgressRow>();
    for (const row of progressRows) {
      if (!latestByWork.has(row.workId)) latestByWork.set(row.workId, row);
    }

    return rows.map((row) => {
      const progress = latestByWork.get(row.work.id) ?? null;
      const lastChapterNumber = progress?.chapter.number ?? null;
      const totalChapters = row.work.chapterCount;
      const progressPercent =
        totalChapters > 0 && lastChapterNumber != null ? Math.round((lastChapterNumber / totalChapters) * 100) : 0;

      return {
        slug: row.work.slug,
        title: row.work.title,
        cover: row.work.coverImage,
        format: row.work.format,
        savedAt: row.createdAt.toISOString(),
        lastChapterNumber,
        page: progress?.page ?? null,
        totalChapters,
        progressPercent,
      };
    });
  }

  async getLikes(accountId: string): Promise<LikedWorkDto[]> {
    const rows = (await this.prisma.favorite.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: { work: { select: { slug: true, title: true, coverImage: true, genre: true, likeCount: true, format: true } } },
    })) as unknown as FavoriteRow[];

    return rows.map((row) => ({
      slug: row.work.slug,
      title: row.work.title,
      cover: row.work.coverImage,
      format: row.work.format,
      genre: row.work.genre,
      likeCount: row.work.likeCount,
      likedAt: row.createdAt.toISOString(),
    }));
  }

  getLikedIllustrations(accountId: string): Promise<LikedIllustrationDto[]> {
    return this.getIllustrationReactions(accountId, 'like');
  }

  getSavedIllustrations(accountId: string): Promise<LikedIllustrationDto[]> {
    return this.getIllustrationReactions(accountId, 'save');
  }

  /**
   * Additive: liked/saved ILLUSTRATIONS for /ma-liste. Reaction has no FK to Illustration (targetId
   * is a plain string, shared with 'chapter'), so this is two queries — Reaction rows (ordered,
   * owner-scoped) then a batch Illustration lookup — instead of an `include` join. Order comes from
   * the Reaction query; illustrations unpublished/deleted since the reaction was recorded are
   * dropped (mirrors DR-8/DR-11's stale-row handling).
   */
  private async getIllustrationReactions(accountId: string, kind: 'like' | 'save'): Promise<LikedIllustrationDto[]> {
    const reactions = (await this.prisma.reaction.findMany({
      where: { accountId, targetType: 'illustration', kind },
      orderBy: { createdAt: 'desc' },
      select: { targetId: true },
    })) as unknown as IllustrationReactionRow[];

    if (reactions.length === 0) return [];

    const illustrations = (await this.prisma.illustration.findMany({
      where: { id: { in: reactions.map((r) => r.targetId) }, publishedAt: { not: null } },
      select: { id: true, title: true, artistName: true, category: true, image: true, likeCount: true },
    })) as unknown as IllustrationRow[];
    const byId = new Map(illustrations.map((i) => [i.id, i]));

    return reactions
      .map((r) => byId.get(r.targetId))
      .filter((i): i is IllustrationRow => i != null)
      .map((i) => ({
        id: i.id,
        title: i.title,
        artistName: i.artistName,
        category: i.category,
        categoryLabel: galleryCategoryLabel(i.category),
        image: i.image,
        likeCount: i.likeCount,
      }));
  }
}
