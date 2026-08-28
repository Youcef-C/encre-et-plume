// CS-5 — Review & corrections. Shared contract between apps/api and apps/web.
// One unified `Correction` entity with a polymorphic anchor (scenario text-range | dessin region).

export type CorrectionType = 'scenario' | 'dessin';
export type CorrectionStatus = 'a_corriger' | 'en_cours' | 'corrige';

export const CORRECTION_STATUSES: readonly CorrectionStatus[] = ['a_corriger', 'en_cours', 'corrige'];

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  a_corriger: 'À corriger',
  en_cours: 'En cours',
  corrige: 'Corrigé',
};

/** scenario anchor — the CS-4 comment text-anchor (ProseMirror positions + durable quote). */
export interface ScenarioAnchor {
  documentId: string;
  from: number;
  to: number;
  quote: string;
  // CS-22 — base64 Yjs relative positions for the same range, carried onto the backing ScenarioComment
  // so a correction highlight survives a reload too. Optional (pre-CS-22 clients omit them).
  relFrom?: string;
  relTo?: string;
}

/** dessin region — normalized 0–1 so it survives image scaling. */
export interface DessinRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DessinAnchor {
  region: DessinRegion;
}

export interface CorrectionDto {
  id: string;
  pageId: string;
  assetId: string;
  type: CorrectionType;
  anchor: ScenarioAnchor | DessinAnchor; // discriminate on `type`
  caseRef: string | null;
  description: string;
  status: CorrectionStatus;
  authorId: string;
  authorName: string;
  assigneeId: string | null;
  filedAgainstVersion: number;
  resolvedInVersion: number | null;
  // CS-24 — who actually pressed « Corrigé » (neither authorId, the filer, nor assigneeId records it)
  // and when the filer acknowledged it. Both null on a correction that was never resolved/verified.
  resolvedById: string | null;
  resolvedByName: string | null;
  verifiedAt: string | null; // ISO
  createdAt: string; // ISO
}

export type CreateCorrectionRequest =
  | { type: 'scenario'; anchor: ScenarioAnchor; description: string; caseNo?: number; caseRef?: string; assigneeId?: string }
  | { type: 'dessin'; assetId: string; anchor: DessinAnchor; description: string; caseRef?: string; assigneeId?: string };

export interface UpdateCorrectionRequest {
  status: CorrectionStatus;
}

export interface CorrectionListQuery {
  type?: CorrectionType;
  status?: CorrectionStatus;
  page?: number;
}
export interface CorrectionListResponse {
  items: CorrectionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export const CORRECTIONS_PAGE_SIZE = 50;

export interface ReviewVersionItem {
  version: number;
  authorName: string;
  createdAt: string;
  note: string | null;
  // CS-24 — signed image URL of this version, so the before/after crops can address ANY listed
  // version (not just the selected pair). Dessin surface only; null on the scenario surface.
  url: string | null;
}
export interface ReviewFileItem {
  assetId: string;
  filename: string;
  type: string;
  surface: 'scenario' | 'dessin';
  currentVersion: number;
}
export interface ReviewPayload {
  pageId: string;
  pageTitle: string;
  stage: string;
  project: { slug: string; title: string };
  members: { accountId: string; displayName: string; avatar: string | null }[];
  files: ReviewFileItem[];
  selected: {
    assetId: string;
    surface: 'scenario' | 'dessin';
    fromVersion: number;
    toVersion: number;
    versions: ReviewVersionItem[];
    // scenario surface:
    fromHtml: string | null;
    toHtml: string | null;
    // dessin surface:
    fromImageUrl: string | null;
    toImageUrl: string | null;
  } | null; // null = no reviewable file linked
  corrections: CorrectionListResponse; // first page, unfiltered
}

export interface ValidateReviewResponse {
  stage: 'propre';
}

/** CS-24 — resolves a notification's correction refId to the review screen that shows it. */
export interface CorrectionLocationResponse {
  projectSlug: string;
  pageId: string;
  /** CS-24 follow-up — which surface actually shows this correction. The review list is dessin-only
   *  (CS-5 r4), so a `scenario` correction is read in the CS-4 editor as its tagged comment; sending
   *  one to /revision lands the reader on a list that structurally cannot contain it. */
  type: CorrectionType;
  /** The scenario asset to open in the editor (`scenario` only; null for a dessin correction). */
  assetId: string | null;
}
