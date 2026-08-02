import type { RankingEntry, RankingRow } from '@encre-et-plume/shared';
import { galleryCategoryLabel, hasPlus18Genre, isWork18Plus } from '@encre-et-plume/shared';
import { workMeta, type WorkMetaRow } from '../works/work-meta';

/** A ranked work carries its creators + chapterCount so the meta line can be DERIVED (see work-meta.ts). */
type RankedWork = WorkMetaRow & { id: string; slug: string; title: string; coverImage: string | null; audienceRating: string };

/** Bounded top-N; the prototype draws no pager for the all-time ranking (YAGNI). */
export const RANKING_LIMIT = 50;

/** Deterministic order with a stable tiebreak — single source shared by RankingService and HomeService. */
export const RANKING_ORDER_BY = [{ likeCount: 'desc' as const }, { id: 'asc' as const }];

// ponytail: score = likeCount today; DR-9 makes it likeCount + readCount + favoriteCount in THIS one place.
export function rankingScore(w: { likeCount: number }): number {
  return w.likeCount;
}

/** "Tout" = no genre filter (empty/undefined genre → {}). */
export function rankingWhere(genre?: string): { genre?: string } {
  return genre && genre.trim() ? { genre } : {};
}

export function toRankingRow(w: RankedWork, index: number): RankingRow {
  return {
    id: w.id,
    slug: w.slug,
    rank: index + 1,
    title: w.title,
    cover: w.coverImage,
    meta: workMeta(w),
    is18plus: isWork18Plus(w.audienceRating),
  };
}

// ── DR-7 Classement category tabs: unified RankingEntry mappers, one per ranked entity ──────────

/** Mangas/Romans tabs: reuses toRankingRow (single truth), adds the work-page href, drops slug. */
export function toRankingEntryFromWork(w: RankedWork, index: number): RankingEntry {
  const row = toRankingRow(w, index);
  return { rank: row.rank, id: row.id, title: row.title, meta: row.meta, cover: row.cover, href: `/oeuvre/${row.slug}`, is18plus: row.is18plus };
}

export function toRankingEntryFromIllustration(
  row: { id: string; title: string; artistName: string; category: string; genres: string[]; likeCount: number; image: string | null },
  index: number,
): RankingEntry {
  return {
    rank: index + 1,
    id: row.id,
    title: row.title,
    meta: `${row.artistName} · ${galleryCategoryLabel(row.category)} · ${row.likeCount} ♥`,
    cover: row.image,
    href: `/illustration/${row.id}`,
    is18plus: hasPlus18Genre(row.genres),
  };
}

// DR-6: same role-label convention as gallery.service.ts's ROLE_LABELS (kept local — 2 entries,
// not worth a shared export).
const CREATOR_ROLE_LABELS: Record<string, string> = { dessinateur: 'Dessinateur·rice', scenariste: 'Scénariste' };

/** Createurs tab: Profile ranked by trendingScore — never 18+-gated (a creator profile, not a work). */
export function toRankingEntryFromProfile(
  row: { creatorRoles: string[]; account: { id: string; displayName: string; profileSlug: string; avatar: string | null } },
  index: number,
): RankingEntry {
  return {
    rank: index + 1,
    id: row.account.id,
    title: row.account.displayName,
    meta: row.creatorRoles.map((r) => CREATOR_ROLE_LABELS[r] ?? r).join(' · '),
    cover: row.account.avatar,
    href: `/${row.account.profileSlug}`,
    is18plus: false,
  };
}
