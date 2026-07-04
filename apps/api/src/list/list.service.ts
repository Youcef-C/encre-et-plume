import { Injectable } from '@nestjs/common';
import type { ListItemDto, LikedWorkDto } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

type WatchlistRow = {
  createdAt: Date;
  work: { id: string; slug: string; title: string; coverImage: string | null; chapterCount: number };
};

type ProgressRow = {
  workId: string;
  page: number;
  updatedAt: Date;
  chapter: { number: number };
};

type FavoriteRow = {
  createdAt: Date;
  work: { slug: string; title: string; coverImage: string | null; genre: string; likeCount: number };
};

/**
 * DR-8 — "Ma liste" (WatchlistItem, new) + "Coups de cœur" (reuses DR-4's Favorite, read-only here;
 * DR-9 owns the like toggle). Progress is joined in-memory from DR-4's ReadingProgress, one query
 * for the whole account (avoids N+1) — mirrors DR-11's dedupe pattern.
 */
@Injectable()
export class ListService {
  constructor(private readonly prisma: PrismaService) {}

  async getList(accountId: string): Promise<ListItemDto[]> {
    const rows = (await this.prisma.watchlistItem.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      include: { work: { select: { id: true, slug: true, title: true, coverImage: true, chapterCount: true } } },
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
      include: { work: { select: { slug: true, title: true, coverImage: true, genre: true, likeCount: true } } },
    })) as unknown as FavoriteRow[];

    return rows.map((row) => ({
      slug: row.work.slug,
      title: row.work.title,
      cover: row.work.coverImage,
      genre: row.work.genre,
      likeCount: row.work.likeCount,
      likedAt: row.createdAt.toISOString(),
    }));
  }

  async removeFromList(accountId: string, slug: string): Promise<void> {
    // Idempotent: 0 rows deleted (already removed / never saved) is not an error.
    await this.prisma.watchlistItem.deleteMany({ where: { accountId, work: { slug } } });
  }
}
