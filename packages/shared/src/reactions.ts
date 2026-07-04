// DR-9 — cross-cutting like/save toggle contract. See reader.ts (Favorite), list.ts (WatchlistItem):
// works route through those existing per-user tables (no dual-write); chapter/illustration route
// through the new generic Reaction table. This file is the unified HTTP-layer shape both routes share.

export const REACTION_TARGET_TYPES = ['work', 'chapter', 'illustration'] as const;
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

export type ReactionKind = 'like' | 'save';

export interface ReactionToggleRequest {
  targetType: ReactionTargetType;
  targetId: string; // work: slug; chapter/illustration: id
}

export interface ReactionToggleResponse {
  active: boolean;
  count: number;
}

export interface ReactionViewerState {
  liked: boolean;
  saved: boolean;
}

/** GET /reactions/state?targetType=&ids= → keyed by the SAME identifier the caller passed (slug for work, id else). */
export type ReactionStateResponse = Record<string, ReactionViewerState>;
