// CS-3 — project assets (versioned files). Bytes live in F-10 Media; these are the FE/BE contracts.

export const ASSET_TYPES = ['dessin', 'texte', 'scenario', 'ref', 'page'] as const; // D1
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SORTS = ['recent', 'name', 'size'] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

export const ASSETS_PAGE_SIZE = 24; // D13

/** Types whose assets may link to MANY cards (2026-07-14 rule); dessin/page stay single-card
 *  (re-link replaces). One source of truth shared by FE (add-vs-replace copy) and BE (cardinality). */
export const MULTI_LINK_ASSET_TYPES = ['scenario', 'texte', 'ref'] as const satisfies readonly AssetType[];

export interface AssetItem {
  id: string;
  type: AssetType;
  filename: string;
  currentVersion: number; // grid badge "v{n}"
  size: number; // bytes, current version — FE formats "2,4 Mo"
  thumbnailUrl: string | null; // resolved server-side (signed/public); null → FE placeholder tile
  previewable: boolean; // false only for psd (and unknown)
  linkedPages: { id: string; title: string }[]; // 2026-07-14 multi-card link; order = link createdAt asc; [] when unlinked
  updatedAt: string; // ISO
}

export interface AssetListQuery {
  type?: AssetType;
  pageId?: string;
  q?: string; // filename, case-insensitive substring, AND-composed
  sort?: AssetSort; // default 'recent'
  page?: number; // 1-based
}

export interface AssetListResponse {
  items: AssetItem[];
  total: number;
  page: number;
  pageSize: number; // = ASSETS_PAGE_SIZE
  totalPages: number;
}

export interface CreateAssetRequest {
  mediaId: string;
  filename: string;
  note?: string;
  type?: AssetType; // optional user-declared type; absent → server derives (D-H)
} // POST /projects/:slug/assets
export interface CreateAssetFromUrlRequest {
  url: string;
  filename?: string;
  type?: AssetType; // optional user-declared type (D-H)
} // POST /projects/:slug/assets/from-url
export interface AddAssetVersionRequest {
  mediaId: string;
  note?: string;
} // POST /projects/:slug/assets/:id/versions
export interface LinkAssetRequest {
  pageId: string;
  type?: AssetType; // section-scoped re-type on link (D-I); absent → keep current type
} // POST /assets/:id/link (add for shared types / replace for single) → AssetItem
// DELETE /assets/:id/link?pageId=<pageId> → AssetItem (per-card unlink; 400 if pageId missing; idempotent)
// DELETE /assets/:id → 204 (removes asset + ALL its links + versions + blobs)

export interface AssetVersionItem {
  version: number;
  mediaId: string;
  size: number;
  note: string | null;
  authorId: string;
  authorName: string;
  createdAt: string; // ISO
  thumbnailUrl: string | null;
}

export type AssetPreviewMode = 'image' | 'pdf' | 'text' | 'html' | 'processing' | 'unavailable';
export interface AssetPreviewResponse {
  mode: AssetPreviewMode;
  url?: string; // image | pdf (short-lived signed)
  text?: string; // txt (≤ 500 KB)
  html?: string; // docx derivative (sanitized server-side)
  downloadUrl: string; // always present — "Télécharger"
  filename: string;
  version: number;
}

export interface DocxPreviewJob {
  mediaId: string;
} // F-8 'image-processing' queue, job 'docx-preview'
