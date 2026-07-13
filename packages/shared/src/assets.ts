// CS-3 — project assets (versioned files). Bytes live in F-10 Media; these are the FE/BE contracts.

export const ASSET_TYPES = ['dessin', 'texte', 'scenario', 'ref', 'page'] as const; // D1
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SORTS = ['recent', 'name', 'size'] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

export const ASSETS_PAGE_SIZE = 24; // D13

export interface AssetItem {
  id: string;
  type: AssetType;
  filename: string;
  currentVersion: number; // grid badge "v{n}"
  size: number; // bytes, current version — FE formats "2,4 Mo"
  thumbnailUrl: string | null; // resolved server-side (signed/public); null → FE placeholder tile
  previewable: boolean; // false only for psd (and unknown)
  linkedPage: { id: string; title: string } | null;
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
} // POST /assets/:id/link · DELETE /assets/:id/link → AssetItem · DELETE /assets/:id → 204

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
