// CS-8 — the F-10 presigned upload seam for MESSAGE attachments (`kind: 'attachment'`, private, so
// delivery goes through a short-lived signed URL and never a public CDN path). Same sequence as
// lib/assetUpload: requestUpload → direct PUT to storage → finalize → poll until ready → mediaId.
// The API never proxies upload bytes (CLAUDE.md F-10 rule).
//
// ponytail: MessagingWidget keeps its own fetch-based copy of this flow because it shows a chip, not
// a progress bar (and its tests stub `fetch` for the PUT). Fold it into this helper the day the
// widget wants progress too — one XHR path instead of two.
import {
  UPLOAD_ALLOWED_CONTENT_TYPES,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from '@encre-et-plume/shared';
import { requestUpload, finalizeMedia, getMedia } from './api';

/** Attachments accept the F-10 `attachment` allowlist: raster images ∪ PDF/TXT. */
export const ATTACHMENT_CONTENT_TYPES = [
  ...UPLOAD_ALLOWED_CONTENT_TYPES,
  ...DOCUMENT_ALLOWED_CONTENT_TYPES,
];
export const ATTACHMENT_ACCEPT = ATTACHMENT_CONTENT_TYPES.join(',');

const ALLOWED = new Set<string>(ATTACHMENT_CONTENT_TYPES);
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1_048_576);
const POLL_MAX_ATTEMPTS = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** French inline message, or null when the file is acceptable. The server re-validates both rules. */
export function validateAttachmentFile(file: File): string | null {
  if (!ALLOWED.has(file.type)) return 'Format non pris en charge (.png .jpg .webp .avif .pdf .txt)';
  if (file.size > MAX_UPLOAD_BYTES) return `Fichier trop volumineux (max ${MAX_MB} Mo)`;
  return null;
}

/**
 * Uploads one already-validated attachment and resolves its ready mediaId.
 * `onProgress` receives 0–100 during the PUT (XHR, the only browser API that reports upload bytes).
 */
export async function uploadAttachmentFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { mediaId, uploadUrl } = await requestUpload({
    kind: 'attachment',
    visibility: 'private',
    contentType: file.type,
    size: file.size,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Échec du téléversement (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Échec du téléversement. Réessayez.'));
    xhr.send(file);
  });

  // Images stay 'pending' until the variants worker flips them to ready.
  let media = await finalizeMedia(mediaId);
  onProgress?.(100);
  for (let attempt = 0; media.status !== 'ready' && attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (media.status === 'failed') throw new Error('Optimisation échouée. Réessayez.');
    await sleep(1000);
    media = await getMedia(mediaId);
  }
  if (media.status !== 'ready') throw new Error('Optimisation trop longue. Réessayez.');
  return mediaId;
}
