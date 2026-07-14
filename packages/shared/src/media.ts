// F-10: Media storage, uploads & delivery — shared contracts (FE + BE agree here).
// CS-3's per-project Asset will reference Media.id; existing URL columns
// (Account.avatar / Profile.coverImage / PortfolioItem.image) keep storing the
// ready public URL — mediaId references are the long-term form.

export const MEDIA_KINDS = [
  'avatar',
  'cover',
  'portfolio',
  'chapter_page',
  'illustration',
  'attachment',
  'article',
  'contest',
  'call_sample', // MC-4: "Appels à projets" sample image (public)
  'application_sample', // MC-5: "Candidater" work-sample upload (public — portfolio parity)
  'call_document', // MC-4X: "Appels à projets" PDF scenario attachment (public, no image derivatives)
  'application_document', // MC-4X: "Candidater" PDF work-sample (public, no image derivatives)
  'asset', // CS-3: project WIP file (drawing/text/script) — private by default, versioned via Asset
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export type MediaStatus = 'pending' | 'ready' | 'failed';
export type MediaVisibility = 'public' | 'private';

// SVG deliberately excluded (XSS risk). Raster only.
export const UPLOAD_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type AllowedContentType = (typeof UPLOAD_ALLOWED_CONTENT_TYPES)[number];

// MC-4X: document kinds (call_document / application_document) allow ONLY PDF/TXT and skip image processing.
export const DOCUMENT_MEDIA_KINDS = ['call_document', 'application_document'] as const;
export const DOCUMENT_ALLOWED_CONTENT_TYPES = ['application/pdf', 'text/plain'] as const;

// CS-3: the `asset` kind accepts images + documents + docx + psd (magic-byte verified at finalize).
export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PSD_CONTENT_TYPE = 'image/vnd.adobe.photoshop';
export const ASSET_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  // CS-4: in-app scenario drafts are ingested as HTML (materialization + explicit version snapshot).
  // Scoped to the `asset` kind like docx/psd. Rendered back ONLY through the docx sanitizer (never raw);
  // stored with an attachment disposition so a direct signed-URL open never executes inline script.
  'text/html',
  DOCX_CONTENT_TYPE,
  PSD_CONTENT_TYPE,
] as const;

// CS-3 (2026-07-13) — Drawing-software source files. Accepted by EXTENSION only: proprietary/binary
// formats report a generic content-type (most `application/octet-stream`; zip-based .kra/.procreate
// share the same PK magic as .docx), so the extension is the reliable discriminator. Stored as
// `dessin`, never previewed, and NEVER downloaded server-side for magic verification (they can be
// hundreds of MB). One shared allowlist keeps the FE drop-zone `accept` + hint and the BE upload
// validation in sync. Deliberate loosening — safe because asset blobs stay private, member-gated,
// and are only ever served as download attachments (never rendered/executed server-side).
export const DRAWING_SOURCE_EXTENSIONS = [
  'clip', // Clip Studio Paint
  'kra', // Krita
  'procreate', // Procreate
  'psd', // Photoshop
  'psb', // Photoshop (large)
  'sai', // PaintTool SAI
  'sai2', // PaintTool SAI 2
  'xcf', // GIMP
  'ase', // Aseprite
  'aseprite', // Aseprite
  'ai', // Illustrator
  'tiff', // TIFF
  'tif', // TIFF
] as const;
export type DrawingSourceExtension = (typeof DRAWING_SOURCE_EXTENSIONS)[number];

// Permissive content-types drawing-source files upload as. Valid ONLY for the `asset` kind — never for
// image/document kinds (octet-stream on a non-asset kind is rejected). PSD keeps its own dedicated
// content-type (magic-verified separately); this set covers the extension-only, no-download formats.
export const DRAWING_SOURCE_CONTENT_TYPES = [
  'application/octet-stream', // generic fallback — most drawing apps / browsers report this
  'application/x-krita', // .kra
  'application/x-photoshop', // .psb (some clients)
  'application/illustrator', // .ai
  'application/postscript', // .ai (classic)
  'image/tiff', // .tiff/.tif
  'image/x-tiff',
  'application/x-clip', // .clip (best-effort)
  'application/x-sai', // .sai
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo — images / documents
export const MAX_ASSET_BYTES = 200 * 1024 * 1024; // 200 Mo — multi-layer drawing-source art files
export const MAX_IMAGE_DIMENSION = 8000; // px, per side

export interface MediaVariants {
  orig: string;
  web: string;
  thumb: string;
  webp?: string;
  avif?: string;
  preview?: string; // CS-3: docx → sanitized HTML derivative bucket key (F-8 'docx-preview' job)
}

// ── API request / response shapes ────────────────────────────────────────────

export interface RequestUploadRequest {
  kind: MediaKind;
  contentType: string;
  size: number;
  visibility?: MediaVisibility;
}

export interface RequestUploadResponse {
  mediaId: string;
  uploadUrl: string;
  bucketKey: string;
  expiresIn: number;
}

export interface MediaResponse {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  visibility: MediaVisibility;
  width: number | null;
  height: number | null;
  variants: MediaVariants | Record<string, never>;
  createdAt: string;
}

export interface SignedUrlResponse {
  url: string;
  expiresIn: number;
}

// ── Queue payload ─────────────────────────────────────────────────────────────

/** Payload for `process-variants` jobs on the `image-processing` queue (F-8). */
export interface ImageProcessingJob {
  mediaId: string;
}

// ── Avatar consumer (B8) ──────────────────────────────────────────────────────

export interface SetAvatarRequest {
  mediaId: string;
}
