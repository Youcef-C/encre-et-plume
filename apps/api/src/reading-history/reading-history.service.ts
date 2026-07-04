import { Injectable } from '@nestjs/common';
import type { ReadingHistoryEntry, ReadingHistoryResponse } from '@encre-et-plume/shared';
import { READING_HISTORY_PAGE_SIZE } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { chapterTotalPages } from '../reader/chapter-pagination';

type ProgressRow = {
  page: number;
  updatedAt: Date;
  work: { slug: string; title: string; format: string };
  chapter: { number: number; title: string | null; prose: string | null; _count: { pages: number } };
};

const INCLUDE = {
  work: { select: { slug: true, title: true, format: true } },
  chapter: { select: { number: true, title: true, prose: true, _count: { select: { pages: true } } } },
} as const;

/**
 * DR-11 — reads DR-4's ReadingProgress model; no model extension (totalPages derived at read
 * time via the shared chapterTotalPages helper, matching the reader's own formula). Never filters
 * premium chapters out (a legitimately-read locked chapter stays resumable — B5).
 */
@Injectable()
export class ReadingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(accountId: string, page: number): Promise<ReadingHistoryResponse> {
    const rows = await this.prisma.readingProgress.findMany({
      where: {
        accountId,
        work: { publishedAt: { not: null } },
        chapter: { status: 'published', publishAt: { lte: new Date() } },
      },
      orderBy: { updatedAt: 'desc' },
      include: INCLUDE,
    });

    // ponytail: in-memory dedupe+paginate is correct for per-account volumes (tens of in-progress
    // works, not thousands; indexed by @@index([accountId, updatedAt])); swap for raw
    // DISTINCT ON (workId) only if one account ever accumulates thousands of rows.
    const deduped = dedupePerWork(rows as unknown as ProgressRow[]);
    const total = deduped.length;
    const start = (page - 1) * READING_HISTORY_PAGE_SIZE;
    const items = deduped.slice(start, start + READING_HISTORY_PAGE_SIZE).map(mapEntry);

    return { items, total, page, pageSize: READING_HISTORY_PAGE_SIZE, totalPages: Math.ceil(total / READING_HISTORY_PAGE_SIZE) };
  }

  async getForWork(accountId: string, workSlug: string): Promise<ReadingHistoryEntry | null> {
    const row = await this.prisma.readingProgress.findFirst({
      where: {
        accountId,
        work: { publishedAt: { not: null }, slug: workSlug },
        chapter: { status: 'published', publishAt: { lte: new Date() } },
      },
      orderBy: { updatedAt: 'desc' },
      include: INCLUDE,
    });

    return row ? mapEntry(row as unknown as ProgressRow) : null;
  }
}

// Rows already ordered updatedAt desc — first row per workId wins (= its latest chapter/page).
function dedupePerWork(rows: ProgressRow[]): ProgressRow[] {
  const seen = new Set<string>();
  const result: ProgressRow[] = [];
  for (const row of rows) {
    if (seen.has(row.work.slug)) continue;
    seen.add(row.work.slug);
    result.push(row);
  }
  return result;
}

function mapEntry(row: ProgressRow): ReadingHistoryEntry {
  return {
    workSlug: row.work.slug,
    workTitle: row.work.title,
    chapterNumber: row.chapter.number,
    chapterTitle: row.chapter.title,
    page: row.page,
    totalPages: chapterTotalPages(row.work.format === 'Roman', row.chapter.prose, row.chapter._count.pages),
    updatedAt: row.updatedAt.toISOString(),
  };
}
