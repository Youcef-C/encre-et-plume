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
