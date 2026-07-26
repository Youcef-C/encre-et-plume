'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MediaKind, MediaResponse, MediaVariants } from '@encre-et-plume/shared';
import {
  UPLOAD_ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  DOCUMENT_MEDIA_KINDS,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
} from '@encre-et-plume/shared';
import { requestUpload, finalizeMedia, getMedia } from '../lib/api';
import AvatarCropModal from './AvatarCropModal';
import { CheckIcon } from './icons';

const ALLOWED_TYPES = new Set<string>(UPLOAD_ALLOWED_CONTENT_TYPES);
const DOCUMENT_TYPES = new Set<string>(DOCUMENT_ALLOWED_CONTENT_TYPES);
const DOCUMENT_KINDS = new Set<string>(DOCUMENT_MEDIA_KINDS);
const COMBINED_ACCEPT = [...UPLOAD_ALLOWED_CONTENT_TYPES, ...DOCUMENT_ALLOWED_CONTENT_TYPES].join(',');
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1_048_576);

type Phase =
  | { kind: 'idle' }
  | { kind: 'cropping'; file: File; objectUrl: string }
  | { kind: 'uploading'; progress: number }
  | { kind: 'processing' }
  | { kind: 'ready'; media: MediaResponse }
  | { kind: 'error'; message: string };

export interface UploadControlProps {
  kind: MediaKind;
  /** Accessible label text shown above the drop zone (e.g. "Photo de profil") */
  label: string;
  /** Override the accept attribute; defaults to all allowed raster types */
  accept?: string;
  /**
   * DR-12 FE-15: existing image URL shown as the initial side-preview thumbnail beside the drop box
   * (e.g. the current avatar / collection cover). Replaced by the newly-uploaded image once a fresh
   * upload reaches ready; null → no thumbnail (the box stands alone).
   */
  currentUrl?: string | null;
  /**
   * MC-4X: ONE combined box for both families — when set, images upload as `kind` and PDF/text files
   * upload as `documentKind`, routed by the picked file's content-type. Parents read `media.kind` in
   * onUploaded to place each result. Omit for the single-kind behaviour used everywhere else.
   */
  documentKind?: MediaKind;
  /** MC-4X: `filename` carries the original File.name (documents have no image variants to show). */
  onUploaded: (media: MediaResponse, filename?: string) => void;
  /** Called whenever the busy state changes (busy = cropping | uploading | processing). */
  onBusyChange?: (busy: boolean) => void;
  /** MC-4X: parent cap gate — return a French message to reject a picked file (e.g. its family is full). */
  extraValidate?: (file: File) => string | null;
  /**
   * DR-12 FE-10: when set, the drop-zone box and the ready-state preview both occupy a fixed frame
   * (drop box `minHeight`, ready preview 120×frameHeight) so the control reads as one consistent
   * cover frame next to a preview-cover box. Omit → default 80px box / 64×64 preview.
   */
  frameHeight?: number;
  /**
   * DR-12 FE-10: render the visible label as screen-reader-only (kept in the DOM for
   * `aria-labelledby`). Use when a sibling heading already names the control so the label doesn't
   * push the drop box down and break top-alignment with an adjacent preview box.
   */
  hideLabel?: boolean;
}

const POLL_MAX_ATTEMPTS = 60; // 60s timeout for image processing

export default function UploadControl({
  kind,
  label,
  accept,
  currentUrl,
  documentKind,
  onUploaded,
  onBusyChange,
  extraValidate,
  frameHeight,
  hideLabel,
}: UploadControlProps) {
  const uid = useId();
  const labelId = `uc-label-${uid}`;
  const statusId = `uc-status-${uid}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  // MC-4X: remember the picked file's name so a document (no image variants) can render it with the check pictogram.
  const fileNameRef = useRef<string | undefined>(undefined);
  const combined = !!documentKind; // ONE box accepting both families
  const isDocument = DOCUMENT_KINDS.has(kind); // single-kind document box (legacy path)
  // The kind a picked file uploads as: doc content-types → documentKind, everything else → kind.
  const kindForFile = (file: File): MediaKind =>
    combined && DOCUMENT_TYPES.has(file.type) ? documentKind! : kind;

  // Refs for abort-on-cancel / unmount
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set to true to signal all async continuations to bail out. */
  const abortedRef = useRef(false);
  const mountedRef = useRef(true);

  // Unmount cleanup — abort in-flight XHR and clear poll timer without touching state.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortedRef.current = true;
      xhrRef.current?.abort();
      if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // Notify parent when the busy state (cropping | uploading | processing) changes.
  useEffect(() => {
    const busy =
      phase.kind === 'cropping' || phase.kind === 'uploading' || phase.kind === 'processing';
    onBusyChange?.(busy);
  }, [phase.kind, onBusyChange]);

  const validate = (file: File): string | null => {
    if (combined) {
      if (!ALLOWED_TYPES.has(file.type) && !DOCUMENT_TYPES.has(file.type))
        return 'Format non pris en charge (image, PDF ou texte)';
    } else if (isDocument) {
      if (!DOCUMENT_TYPES.has(file.type)) return 'Format non pris en charge (PDF, TXT)';
    } else if (!ALLOWED_TYPES.has(file.type)) {
      return 'Format non pris en charge (JPEG, PNG, WebP, AVIF)';
    }
    if (file.size > MAX_UPLOAD_BYTES)
      return `Fichier trop volumineux (max ${MAX_MB} Mo)`;
    return extraValidate?.(file) ?? null;
  };

  /** User-initiated abort: stop XHR + poll timer and return to idle. */
  const abortUpload = () => {
    abortedRef.current = true;
    xhrRef.current?.abort();
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPhase({ kind: 'idle' });
  };

  /**
   * Schedule one poll attempt; stores the timer ID in pollTimerRef so abortUpload can clear it.
   * First attempt uses 0ms delay (immediate) to match the original eager-check behavior.
   * Retries use 1s delay.
   */
  function schedulePoll(mediaId: string, attempt: number) {
    if (abortedRef.current) return;
    // ponytail: 0ms for first check (immediate on next task), 1000ms between retries
    const delay = attempt === 0 ? 0 : 1000;
    pollTimerRef.current = setTimeout(() => {
      if (abortedRef.current || !mountedRef.current) return;
      void (async () => {
        try {
          const m = await getMedia(mediaId);
          if (abortedRef.current || !mountedRef.current) return;
          if (m.status === 'ready') {
            setPhase({ kind: 'ready', media: m });
            onUploaded(m, fileNameRef.current);
          } else if (m.status === 'failed') {
            setPhase({ kind: 'error', message: 'Optimisation échouée. Réessayez.' });
          } else if (attempt + 1 >= POLL_MAX_ATTEMPTS) {
            setPhase({ kind: 'error', message: 'Optimisation trop longue. Réessayez.' });
          } else {
            schedulePoll(mediaId, attempt + 1);
          }
        } catch {
          if (!abortedRef.current && mountedRef.current) {
            setPhase({ kind: 'error', message: 'Optimisation échouée. Réessayez.' });
          }
        }
      })();
    }, delay);
  }

  /** Full presign → PUT (XHR with progress) → finalize → poll flow. */
  const startUpload = async (blob: Blob, contentType: string, uploadKind: MediaKind = kind) => {
    // Reset abort flag at the start of each fresh upload.
    abortedRef.current = false;
    try {
      const { mediaId, uploadUrl } = await requestUpload({
        kind: uploadKind,
        contentType,
        size: blob.size,
      });
      if (abortedRef.current || !mountedRef.current) return;

      // PUT bytes directly to storage with progress — NO session cookie, only Content-Type header.
      setPhase({ kind: 'uploading', progress: 0 });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (e: ProgressEvent) => {
          if (e.lengthComputable) {
            setPhase({ kind: 'uploading', progress: Math.round((e.loaded / e.total) * 100) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Échec du téléversement (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Échec du téléversement. Réessayez.'));
        // xhr.abort() fires onabort; treat it as a silent bail (abortedRef already set).
        xhr.onabort = () => reject(new DOMException('Annulé', 'AbortError'));
        xhr.send(blob);
      });

      if (abortedRef.current || !mountedRef.current) return;

      // Finalize: API verifies, EXIF-strips, enqueues variants job.
      setPhase({ kind: 'processing' });
      await finalizeMedia(mediaId);
      if (abortedRef.current || !mountedRef.current) return;

      // Poll until ready (or failed / timeout).
      schedulePoll(mediaId, 0);
    } catch (e: unknown) {
      // Bail silently on deliberate abort or unmount.
      if (abortedRef.current || !mountedRef.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message: unknown }).message)
            : 'Échec du téléversement. Réessayez.';
      setPhase({ kind: 'error', message: msg });
    }
  };

  /** Handle a raw file input: validate, then show crop (avatar) or upload directly. */
  const handleRawFile = (file: File) => {
    const err = validate(file);
    if (err) {
      setPhase({ kind: 'error', message: err });
      return;
    }
    fileNameRef.current = file.name;
    if (kind === 'avatar') {
      // Show crop UI first for avatar uploads — no distortion.
      const objectUrl = URL.createObjectURL(file);
      setPhase({ kind: 'cropping', file, objectUrl });
    } else {
      void startUpload(file, file.type, kindForFile(file));
    }
  };

  const handleCropConfirm = (blob: Blob, contentType: string) => {
    if (phase.kind === 'cropping') {
      URL.revokeObjectURL(phase.objectUrl);
    }
    void startUpload(blob, contentType);
  };

  const handleCropCancel = () => {
    if (phase.kind === 'cropping') {
      URL.revokeObjectURL(phase.objectUrl);
    }
    setPhase({ kind: 'idle' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleRawFile(file);
    // Reset so the same file can be re-selected after a retry.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleRawFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const reset = () => setPhase({ kind: 'idle' });

  const isWorking = phase.kind === 'uploading' || phase.kind === 'processing';
  // The ready item shows as a document when the box is single-doc, or (combined) when the uploaded
  // media landed as a document kind.
  const readyIsDocument =
    phase.kind === 'ready' && (isDocument || DOCUMENT_KINDS.has(phase.media.kind));
  // FE-15: image variants from a completed (non-document) upload — the side preview shows these,
  // else falls back to the `currentUrl` prop (initial context). The drop box itself never becomes
  // the preview; it stays the persistent droppable control in every phase.
  const readyVariants =
    phase.kind === 'ready' && !readyIsDocument ? (phase.media.variants as MediaVariants) : null;
  const previewUrl = readyVariants?.web ?? currentUrl ?? null;
  const previewSize = frameHeight ? 120 : 64;

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Crop modal — fixed overlay, shown after file selection for avatar kind */}
      {phase.kind === 'cropping' && (
        <AvatarCropModal
          imageSrc={phase.objectUrl}
          contentType={phase.file.type}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}

      {/* Label — visible by default; sr-only when a sibling heading already names the control so it
          doesn't offset the drop box out of top-alignment with an adjacent preview (FE-10). */}
      <div
        id={labelId}
        className="ep-label"
        style={
          hideLabel
            ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }
            : { marginBottom: 6 }
        }
      >
        {label}
      </div>

      {/* Hidden file input — keyboard access is via the button below */}
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? (combined ? COMBINED_ACCEPT : isDocument ? 'application/pdf,text/plain' : UPLOAD_ALLOWED_CONTENT_TYPES.join(','))}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* FE-15: the drop box persists in EVERY phase (incl. ready) — it is the replace control (D24,
          "Changer" removed). The preview is a separate side thumbnail that updates on each upload and
          never replaces the box; box + preview are a top-aligned, wrapping row (keeps the FE-10
          one-frame criterion — D23). */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => !isWorking && inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          disabled={isWorking}
          aria-labelledby={labelId}
          aria-describedby={statusId}
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--ink)'}`,
            borderRadius: 8,
            padding: '20px 16px',
            textAlign: 'center',
            cursor: isWorking ? 'default' : 'pointer',
            background: dragOver ? 'var(--accent-soft)' : 'var(--card)',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: 'inherit',
            transition: 'border-color 0.1s, background 0.1s',
            minHeight: frameHeight ?? 80,
          }}
        >
          {/* Ready shows the idle copy again — dropping/picking a new file simply replaces it. */}
          {(phase.kind === 'idle' || phase.kind === 'ready') && (
            <span>
              {combined
                ? 'Glissez une image, un PDF ou un fichier texte, ou cliquez pour choisir'
                : isDocument
                  ? 'Glissez un PDF ou cliquez pour choisir'
                  : 'Glissez une image ou cliquez pour choisir'}
            </span>
          )}

          {phase.kind === 'cropping' && (
            <span>Recadrage en cours…</span>
          )}

          {phase.kind === 'uploading' && (
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>
                Téléversement… {phase.progress}%
              </div>
              {/* Progress bar */}
              <div
                role="progressbar"
                aria-valuenow={phase.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  height: 4,
                  background: 'var(--tone)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${phase.progress}%`,
                    background: 'var(--accent)',
                    borderRadius: 2,
                    transition: 'width 0.1s',
                  }}
                />
              </div>
            </div>
          )}

          {phase.kind === 'processing' && <span>Optimisation…</span>}

          {phase.kind === 'error' && (
            <span style={{ color: 'var(--accent)' }}>{phase.message}</span>
          )}
        </button>

        {/* Side preview — document ready shows the check pictogram + filename; otherwise an image thumbnail from the
            just-uploaded variants, else the currentUrl context. No source → no thumbnail. */}
        {readyIsDocument ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--ink)', maxWidth: 220, flex: 'none' }}>
            <CheckIcon size={13} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileNameRef.current ?? 'Document'}
            </span>
          </span>
        ) : previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl}
            srcSet={
              readyVariants?.thumb
                ? `${readyVariants.thumb} 320w, ${readyVariants.web} 1280w`
                : undefined
            }
            sizes={`${previewSize}px`}
            alt={label}
            width={previewSize}
            height={frameHeight ?? 64}
            style={{
              // Circle is an avatar affordance; every other kind previews as a rounded rectangle.
              borderRadius: kind === 'avatar' ? '50%' : 6,
              border: '2px solid var(--ink)',
              objectFit: 'cover',
              flex: 'none',
            }}
          />
        ) : null}
      </div>

      {/* Annuler — visible during uploading and processing; aborts and returns to idle */}
      {isWorking && (
        <button
          type="button"
          onClick={abortUpload}
          className="ep-btn-secondary"
          style={{ marginTop: 8, fontSize: 13, padding: '6px 14px' }}
        >
          Annuler
        </button>
      )}

      {/* Retry button — visible below the drop zone on error */}
      {phase.kind === 'error' && (
        <button
          type="button"
          onClick={reset}
          className="ep-btn-secondary"
          style={{ marginTop: 8, fontSize: 13, padding: '6px 14px' }}
        >
          Réessayer
        </button>
      )}

      {/* SR-only aria-live region for polite progress announcements */}
      <div
        id={statusId}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
        }}
      >
        {phase.kind === 'uploading' && `Téléversement… ${phase.progress}%`}
        {phase.kind === 'processing' && 'Optimisation…'}
      </div>
    </div>
  );
}
