// DR-8 — "Ma liste & coups de cœur" (route /ma-liste). Read surfaces over WatchlistItem (saved) and
// Favorite (liked); the remove is the only write here. Add-to-list + like toggles are DR-9.

export interface ListItemDto {
  slug: string;
  title: string;
  cover: string | null; // Work.coverImage; null → CSS halftone placeholder
  savedAt: string; // ISO — WatchlistItem.createdAt
  lastChapterNumber: number | null; // null → "Pas commencé"
  page: number | null; // resume page within lastChapter (deep-link ?page=)
  totalChapters: number; // Work.chapterCount → "/ 12"
  progressPercent: number; // 0-100 mini-bar; 0 when not started
}

export interface LikedWorkDto {
  slug: string;
  title: string;
  cover: string | null;
  genre: string; // Work.genre fr label
  likeCount: number; // Work.likeCount (app-wide ♥ counter) → "♥ 8,1k" via formatLikes()
  likedAt: string; // ISO — Favorite.createdAt
}
