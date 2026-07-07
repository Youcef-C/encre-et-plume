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

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_IMAGE_DIMENSION = 8000; // px, per side

export interface MediaVariants {
  orig: string;
  web: string;
  thumb: string;
  webp?: string;
  avif?: string;
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
