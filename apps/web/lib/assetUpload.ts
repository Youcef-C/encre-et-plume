// CS-3 — the F-10 presigned upload seam for project assets. One helper reused by FichiersPanel's
// multi-file import and by AssetVersionsModal's "Nouvelle version" flow: client-side validation,
// then requestUpload → direct PUT to storage (progress) → finalize → poll until ready → mediaId.
// The API never proxies upload bytes (CLAUDE.md F-10 rule).
import {
  ASSET_ALLOWED_CONTENT_TYPES,
  DOCX_CONTENT_TYPE,
  PSD_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
} from '@encre-et-plume/shared';
import { requestUpload, finalizeMedia, getMedia } from './api';

const ALLOWED = new Set<string>(ASSET_ALLOWED_CONTENT_TYPES);
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1_048_576);

// Extension → content-type fallback (browsers often report an empty MIME for .psd / .docx / .txt).
const EXT_TO_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: DOCX_CONTENT_TYPE,
  psd: PSD_CONTENT_TYPE,
};

/** The content-type we upload the file as: the browser's, else derived from the extension. */
export function assetContentType(file: File): string {
  if (file.type && ALLOWED.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_TYPE[ext] ?? file.type;
}

/** French inline validation message, or null when the file is acceptable. */
export function validateAssetFile(file: File): string | null {
  if (!ALLOWED.has(assetContentType(file)))
    return 'Format non pris en charge (.png .jpg .psd .txt .docx .pdf)';
  if (file.size > MAX_UPLOAD_BYTES) return `Fichier trop volumineux (max ${MAX_MB} Mo)`;
  return null;
}

const POLL_MAX_ATTEMPTS = 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the full presigned upload for one already-validated file and resolves the ready mediaId.
 * `onProgress` receives 0–100. Rejects with an Error carrying a French message on failure.
 */
export async function uploadAssetFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const contentType = assetContentType(file);
  const { mediaId, uploadUrl } = await requestUpload({ kind: 'asset', contentType, size: file.size });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
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

  // Finalize verifies + routes; images stay 'pending' until the variants worker flips them to ready.
  let media = await finalizeMedia(mediaId);
  for (let attempt = 0; media.status !== 'ready' && attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (media.status === 'failed') throw new Error('Optimisation échouée. Réessayez.');
    await sleep(1000);
    media = await getMedia(mediaId);
  }
  if (media.status !== 'ready') throw new Error('Optimisation trop longue. Réessayez.');
  return mediaId;
}
