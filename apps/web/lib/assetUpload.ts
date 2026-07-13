// CS-3 — the F-10 presigned upload seam for project assets. One helper reused by FichiersPanel's
// multi-file import and by AssetVersionsModal's "Nouvelle version" flow: client-side validation,
// then requestUpload → direct PUT to storage (progress) → finalize → poll until ready → mediaId.
// The API never proxies upload bytes (CLAUDE.md F-10 rule).
import {
  ASSET_ALLOWED_CONTENT_TYPES,
  DOCX_CONTENT_TYPE,
  PSD_CONTENT_TYPE,
  DRAWING_SOURCE_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_ASSET_BYTES,
} from '@encre-et-plume/shared';
import { requestUpload, finalizeMedia, getMedia } from './api';

const ALLOWED = new Set<string>(ASSET_ALLOWED_CONTENT_TYPES);
const DRAWING_EXTS = new Set<string>(DRAWING_SOURCE_EXTENSIONS);
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1_048_576);
const MAX_ASSET_MB = Math.round(MAX_ASSET_BYTES / 1_048_576);

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

function fileExt(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

/** The content-type we upload the file as: the browser's (if allowlisted), else derived from the
 *  extension. Drawing-source formats (.clip/.kra/.procreate/…, except .psd) upload as octet-stream —
 *  they're accepted by extension server-side and never magic-verified. */
export function assetContentType(file: File): string {
  if (file.type && ALLOWED.has(file.type)) return file.type;
  const ext = fileExt(file);
  if (EXT_TO_TYPE[ext]) return EXT_TO_TYPE[ext];
  if (DRAWING_EXTS.has(ext)) return 'application/octet-stream';
  return file.type;
}

/** French inline validation message, or null when the file is acceptable. Drawing-source files get
 *  the raised ~200 MB cap; images/documents keep the 10 MB cap. */
export function validateAssetFile(file: File): string | null {
  const ext = fileExt(file);
  const isDrawing = DRAWING_EXTS.has(ext);
  if (!isDrawing && !ALLOWED.has(assetContentType(file)))
    return 'Format non pris en charge (.png .jpg .psd .clip .kra .procreate .txt .docx .pdf)';
  const cap = isDrawing ? MAX_ASSET_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > cap) return `Fichier trop volumineux (max ${isDrawing ? MAX_ASSET_MB : MAX_MB} Mo)`;
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
