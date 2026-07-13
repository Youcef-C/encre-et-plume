// CS-1 seam — minimal project contract so MC-3's invite picker + ownership validation work.
// CS-1 extends this (never renames): adds creation, workspace, collaborators.
// CS-12 extends it further (never renames) for the "Mes projets" dashboard listing.

import type { CreatorRole } from './onboarding.js';
import type { CatalogAudienceRating } from './catalog.js';
import type { RevenueSplitEntry, SoutienGoalInput, SoutienTier } from './collections.js';
import type { AssetType } from './assets.js';

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

// ── CS-1 · "Nouveau projet" create wizard (POST /projects) ───────────────────
// Manga/Histoire wizard only — the Illustration(s) type routes to POST /illustrations (DR-5).

export const PROJECT_TYPES = ['manga', 'story'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_FORMATS = ['serie', 'oneshot'] as const;
export type ProjectFormat = (typeof PROJECT_FORMATS)[number];

export const PROJECT_VISIBILITIES = ['prive', 'invitation', 'public'] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

/** "Je recherche" per-role counters — >0 seeds an MC-4 "Appel à projets" call. */
export interface ProjectSeeking {
  scenariste?: number;
  dessinateur?: number;
}

/**
 * CS-1 create request. Everything beyond `type`/`title` is optional so "Configurer plus tard"
 * creates immediately with whatever step 2 holds. Œuvre-level fields (synopsis, hashtags, genre,
 * themes, audienceRating, format, cover) seed the project's Work/œuvre; workspace/collab fields
 * (visibility, invites, seeking) stay on the Project. Soutien (tiers/allowDonations/goals/
 * revenueSplit) is stored raw on the Work per the DR-12 precedent (MR-1/MR-2/CS-10 normalize later).
 */
export interface CreateProjectRequest {
  type: ProjectType;
  title: string;
  cover?: { mediaId: string }; // F-10 cover media (kind 'cover', ready) → Work.coverImage / Project.cover
  synopsis?: string;
  hashtags?: string[]; // F-22 freetext chips, normalized server-side
  format?: ProjectFormat; // default 'serie'
  contestId?: string; // open contest only → linked on the Work
  genre?: string; // F-20 vocabulary id (single)
  themes?: string[]; // F-20 vocabulary ids (multi)
  audienceRating?: CatalogAudienceRating; // default 'Tous publics'
  visibility?: ProjectVisibility; // default 'prive'
  invites?: string[]; // accountIds → MC-3 invitations
  seeking?: ProjectSeeking; // >0 → MC-4 call seed
  tiers?: SoutienTier[];
  allowDonations?: boolean;
  goals?: SoutienGoalInput[];
  revenueSplit?: RevenueSplitEntry[]; // Σ pct === 100 when non-empty; accountIds ⊆ owner+invites
}

export interface CreateProjectResponse {
  id: string;
  slug: string; // shared by /projet/{slug} and /oeuvre/{slug}
  workId: string;
  title: string;
}

// ── CS-2 · project workspace "Espace projet" ────────────────────────────────
// The kanban's 6 production columns (script → validated art). Stage values are
// constrained to exactly this set server-side.
export const PAGE_STAGES = ['scenario', 'nemu', 'corrections', 'propre', 'encrage', 'valide'] as const;
export type PageStage = (typeof PAGE_STAGES)[number];

/** File-type tag chips on a board card. */
export const PAGE_FILE_TAGS = ['scenario', 'ref', 'nemu', 'double'] as const;
export type PageFileTag = (typeof PAGE_FILE_TAGS)[number];

// ── CS-2 card-modal extension: fixed on-brand label palette ──────────────────
// User-created project labels pick a colour from THIS set only; the server rejects
// any other value (400 «Couleur invalide»).
export const LABEL_COLORS = [
  '#e8261c', // rouge (accent)
  '#e07a1f', // orange
  '#d9a521', // ocre
  '#7a8c3c', // olive
  '#2e7d5b', // vert
  '#2c6e8a', // canard
  '#3f5aa8', // bleu
  '#7d4fa0', // violet
  '#b0486e', // rose
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
/** FE swatch aria-labels, keyed by hex. */
export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
  '#e8261c': 'rouge',
  '#e07a1f': 'orange',
  '#d9a521': 'ocre',
  '#7a8c3c': 'olive',
  '#2e7d5b': 'vert',
  '#2c6e8a': 'canard',
  '#3f5aa8': 'bleu',
  '#7d4fa0': 'violet',
  '#b0486e': 'rose',
};

export interface ProjectLabelItem {
  id: string;
  name: string;
  color: string;
}
export interface CreateLabelRequest {
  name: string;
  color: string;
} // POST /projects/:slug/labels
export interface UpdateLabelRequest {
  name?: string;
  color?: string;
} // PATCH /labels/:id

export interface PageAssigneeRef {
  accountId: string;
  displayName: string;
  avatar: string | null;
}
export interface PageChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  order: number;
}
export interface PageCommentItem {
  id: string;
  authorId: string; // FE compares with session account id for Modifier/Supprimer
  authorName: string;
  authorAvatar: string | null;
  body: string;
  createdAt: string; // ISO
  editedAt: string | null; // set → FE shows "modifié"
}

/** A linked CS-3 file (Asset) resolved onto a board card, for the card's per-type FICHIERS sections,
 *  per-file chips, and the derived "⎘ vN" badge (max version). Derived server-side from
 *  `Asset.linkedPageId` — the FE never derives the rollup from a stored counter. */
export interface PageLinkedFileRef {
  assetId: string;
  type: AssetType;
  filename: string;
  version: number; // = Asset.currentVersion
}

/** A kanban board card (CS-2 `Page`) — NOT the reader `Planche`. */
export interface WorkspacePage {
  id: string;
  chapterId: string | null;
  title: string;
  stage: PageStage;
  fileTags: PageFileTag[];
  linkedFileIds: string[]; // server-maintained denorm (CS-3 link logic); kept for compat
  linkedFiles: PageLinkedFileRef[]; // CS-3 assets linked to this card (badge/chips/sections)
  // CS-2 card-modal extension (server always computes these — additive for consumers):
  dueDate: string | null; // 'YYYY-MM-DD'
  labels: ProjectLabelItem[];
  assignees: PageAssigneeRef[];
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
}

export interface WorkspaceMember {
  accountId: string;
  displayName: string;
  avatar: string | null;
  roles: string[]; // member's active profile creatorRoles (scenariste/dessinateur) → one icon each
}

export interface WorkspaceChapter {
  id: string;
  number: number;
  title: string | null;
  status: string;
  plancheCount: number;
}

export interface WorkspaceReview {
  id: string;
  authorName: string;
  storyRating: number;
  artRating: number;
  text: string; // '' when hidden
  hidden: boolean;
  createdAt: string;
}

export interface WorkspaceReviewSummary {
  overall: number;
  story: number;
  art: number;
  count: number;
}

/** GET /projects/{slug} — the full workspace payload the FE binds to. */
export interface ProjectWorkspaceResponse {
  id: string;
  slug: string;
  workSlug: string;
  title: string;
  synopsis: string;
  hashtags: string[];
  collabOpen: boolean;
  visibility: ProjectVisibility;
  cover: string | null; // resolved URL; null → FE halftone placeholder
  members: WorkspaceMember[];
  chapters: WorkspaceChapter[];
  pages: WorkspacePage[];
  labels: ProjectLabelItem[]; // CS-2: the project's label palette (filter row + modal picker)
  reviews: { summary: WorkspaceReviewSummary; items: WorkspaceReview[] };
  viewer: { isMember: boolean; isOwner: boolean };
}

/** PATCH /projects/{slug} — debounced field-level auto-save sends deltas (all optional). */
export interface UpdateProjectInfoRequest {
  title?: string;
  synopsis?: string;
  hashtags?: string[];
  collabOpen?: boolean;
  cover?: { mediaId: string } | null; // F-10 media reference — never bytes; null clears the cover
}

export interface UpdateProjectInfoResponse {
  title: string;
  synopsis: string;
  hashtags: string[];
  collabOpen: boolean;
  cover: string | null;
}

export interface CreatePageRequest {
  chapterId?: string | null;
  title?: string;
  stage?: PageStage;
}

export interface UpdatePageRequest {
  title?: string;
  chapterId?: string | null;
  fileTags?: PageFileTag[];
  // NOTE: linkedFileIds is NOT writable here — link state is owned by CS-3's POST /assets/:id/link.
  // CS-2 card-modal extension (all optional; null clears where nullable):
  description?: string | null;
  dueDate?: string | null; // 'YYYY-MM-DD'
  labelIds?: string[]; // full replacement set
  assigneeIds?: string[]; // full replacement set — server diffs + notifies
}

export interface UpdatePageStageRequest {
  stage: PageStage;
}

/** GET /pages/:id — full card detail for the modal. */
export interface PageDetailResponse extends WorkspacePage {
  description: string | null;
  checklist: PageChecklistItemDto[]; // order asc
  comments: PageCommentItem[]; // createdAt asc
}

export interface CreateChecklistItemRequest {
  text: string;
} // POST /pages/:id/checklist
export interface UpdateChecklistItemRequest {
  text?: string;
  done?: boolean;
} // PATCH /checklist/:itemId
export interface CreatePageCommentRequest {
  body: string;
} // POST /pages/:id/comments
export interface UpdatePageCommentRequest {
  body: string;
} // PATCH /comments/:id
