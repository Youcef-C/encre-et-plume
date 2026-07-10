// CS-1 seam — minimal project contract so MC-3's invite picker + ownership validation work.
// CS-1 extends this (never renames): adds creation, workspace, collaborators.
// CS-12 extends it further (never renames) for the "Mes projets" dashboard listing.

import type { CreatorRole } from './onboarding.js';

export interface ProjectSummary {
  id: string;
  title: string;
  /** Server-composed meta line, e.g. "Manga · Seinen · en cours". */
  meta: string;
  /** Cover image URL; null -> FE halftone placeholder. */
  cover: string | null;
}

// ── CS-12 · "Mes projets" dashboard ─────────────────────────────────────────

export const PROJECTS_PAGE_SIZE = 20;
export const PROJECTS_SEARCH_MAX = 100;

export const PROJECT_STATUS_FILTERS = ['tous', 'en-cours', 'en-pause', 'publies'] as const;
export type ProjectStatusFilter = (typeof PROJECT_STATUS_FILTERS)[number];

export const PROJECT_TYPE_FILTERS = ['tous', 'manga', 'histoire', 'illustrations', 'collections'] as const;
export type ProjectTypeFilter = (typeof PROJECT_TYPE_FILTERS)[number];

export interface ProjectMemberRef {
  id: string;
  name: string; // Account displayName
  role: CreatorRole | null; // profile.creatorRoles[0] ?? null → FE icon (PenNibIcon/BrushIcon)
  self: boolean; // true for the caller's own row
}

/** CS-12 dashboard row. Extends ProjectSummary so MC-3/MC-4 picker callers keep working.
 *  `cover` satisfies the story's `coverImage` (kept name — non-breaking; null → halftone).
 *  The dashboard-only fields are OPTIONAL so the legacy `scope='projects'` picker path can keep
 *  returning bare ProjectSummary objects (single cheap query). They are ALWAYS present when the
 *  page calls with `scope='all'` — the FE dashboard can rely on them there. */
export interface MyProjectItem extends ProjectSummary {
  slug?: string | null; // Project.slug (nullable legacy) | Work.slug (collection → Voir /oeuvre/{slug})
  type?: string; // badge verbatim: "Manga" | "Histoire" | "Illustration(s)"
  status?: string | null; // series only: "en cours" | "en révision" | "en pause" | "publié"; null for illustration/collection rows
  members?: ProjectMemberRef[]; // owner first, then accepted invitees
  step?: string | null; // "encrage Ch.1" — CS-2/CS-5 write it later
  nextReleaseAt?: string | null; // ISO — CS-9 writes it later
  kind?: 'project' | 'collection' | 'illustration'; // collection → /collection/:id/gerer; illustration → /illustration/:id
  illustrationCount?: number | null; // collections only
}

export interface MyProjectsSummary {
  active: number; // status ∈ {en cours, en révision} (incl. collections)
  enRevision: number;
  nextReleaseAt: string | null; // min future release across all items, ISO
}

export interface MyProjectsQuery {
  scope?: 'projects' | 'all'; // default 'projects' = legacy picker behavior
  q?: string;
  status?: ProjectStatusFilter;
  type?: ProjectTypeFilter; // dashboard badge filter; composes (AND) with status + q
  page?: number; // 1-based, pageSize fixed PROJECTS_PAGE_SIZE
}

export interface MyProjectsResponse {
  items: MyProjectItem[]; // superset of the old ProjectSummary[] — additive
  total?: number; // present when scope='all'
  page?: number;
  pageSize?: number;
  summary?: MyProjectsSummary; // present when scope='all'
}
