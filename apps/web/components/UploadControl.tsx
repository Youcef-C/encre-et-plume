'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MediaKind, MediaResponse, MediaVariants } from '@encre-et-plume/shared';
import { UPLOAD_ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from '@encre-et-plume/shared';
import { requestUpload, finalizeMedia, getMedia } from '../lib/api';
import AvatarCropModal from './AvatarCropModal';

const ALLOWED_TYPES = new Set<string>(UPLOAD_ALLOWED_CONTENT_TYPES);
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
  /** Existing image URL shown as initial context (not displayed in idle state) */
  currentUrl?: string | null;
  onUploaded: (media: MediaResponse) => void;
  /** Called whenever the busy state changes (busy = cropping | uploading | processing). */
  onBusyChange?: (busy: boolean) => void;
}

const POLL_MAX_ATTEMPTS = 60; // 60s timeout for image processing

export default function UploadControl({
  kind,
  label,
  accept,
  onUploaded,
  onBusyChange,
}: UploadControlProps) {
  const uid = useId();
  const labelId = `uc-label-${uid}`;
  const statusId = `uc-status-${uid}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);

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
    if (!ALLOWED_TYPES.has(file.type))
      return 'Format non pris en charge (JPEG, PNG, WebP, AVIF)';
    if (file.size > MAX_UPLOAD_BYTES)
      return `Fichier trop volumineux (max ${MAX_MB} Mo)`;
    return null;
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
            onUploaded(m);
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
  const startUpload = async (blob: Blob, contentType: string) => {
    // Reset abort flag at the start of each fresh upload.
    abortedRef.current = false;
    try {
      const { mediaId, uploadUrl } = await requestUpload({
        kind,
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
    if (kind === 'avatar') {
      // Show crop UI first for avatar uploads — no distortion.
      const objectUrl = URL.createObjectURL(file);
      setPhase({ kind: 'cropping', file, objectUrl });
    } else {
      void startUpload(file, file.type);
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
  const variants = phase.kind === 'ready' ? (phase.media.variants as MediaVariants) : null;

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

      {/* Visible label */}
      <div id={labelId} className="ep-label" style={{ marginBottom: 6 }}>
        {label}
      </div>

      {/* Hidden file input — keyboard access is via the button below */}
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? UPLOAD_ALLOWED_CONTENT_TYPES.join(',')}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Drop zone / interactive area */}
      {phase.kind !== 'ready' ? (
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
            width: '100%',
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
            display: 'block',
            minHeight: 80,
          }}
        >
          {phase.kind === 'idle' && (
            <span>Glissez une image ou cliquez pour choisir</span>
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
      ) : (
        /* Ready: show thumbnail preview */
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={variants!.web}
            srcSet={
              variants!.thumb
                ? `${variants!.thumb} 320w, ${variants!.web} 1280w`
                : undefined
            }
            sizes="64px"
            alt={label}
            width={64}
            height={64}
            style={{
              // Circle is an avatar affordance; every other kind previews as a rounded rectangle.
              borderRadius: kind === 'avatar' ? '50%' : 6,
              border: '2px solid var(--ink)',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
          <button
            type="button"
            onClick={reset}
            className="ep-btn-secondary"
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            Changer
          </button>
        </div>
      )}

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
