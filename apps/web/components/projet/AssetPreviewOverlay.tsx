'use client';

// CS-3 F7 — in-app document preview (user-specified 2026-07-09). "Aperçu" opens the asset inline;
// the reader never downloads it to read it. Images, PDFs (sandboxed iframe, storage origin ≠ app
// origin), .txt and .docx (server-sanitized HTML). Read-only, Escape/keyboard-dismissible, scrolls
// long documents. A "Télécharger" link stays available but is never required to view.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import type { AssetPreviewResponse } from '@encre-et-plume/shared';
import { getAssetPreview } from '../../lib/api';
import { XIcon, DownloadIcon } from '../icons';

export interface AssetPreviewOverlayProps {
  assetId: string;
  filename: string;
  version: number;
  onClose: () => void;
}

export default function AssetPreviewOverlay({ assetId, filename, version, onClose }: AssetPreviewOverlayProps) {
  useScrollLock();
  const [preview, setPreview] = useState<AssetPreviewResponse | null>(null);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`preview-${Math.random().toString(36).slice(2)}`).current;

  const load = useCallback(() => {
    setError(false);
    setPreview(null);
    getAssetPreview(assetId)
      .then(setPreview)
      .catch(() => setError(true));
  }, [assetId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      style={overlay}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={panel}>
        <div style={header}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              id={titleId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {filename}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>v{version}</div>
          </div>
          {preview?.downloadUrl && (
            <a href={preview.downloadUrl} target="_blank" rel="noreferrer" style={dlLink}>
              <DownloadIcon size={15} /> Télécharger
            </a>
          )}
          <button ref={closeRef} type="button" aria-label="Fermer l’aperçu" onClick={onClose} style={closeBtn}>
            <XIcon size={20} />
          </button>
        </div>

        <div style={body}>
          {error ? (
            <div style={centered}>
              <p style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 12 }}>Impossible de charger l’aperçu.</p>
              <button type="button" onClick={load} style={retryBtn}>
                Réessayer
              </button>
            </div>
          ) : !preview ? (
            <div style={centered}>
              <p style={{ fontSize: 14, color: 'var(--ink2)' }}>Chargement…</p>
            </div>
          ) : preview.mode === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={filename}
              style={{ margin: 'auto', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '3px solid var(--ink)' }}
            />
          ) : preview.mode === 'pdf' ? (
            <div style={pdfWrap}>
              {/* No `sandbox` here: the browser's native PDF viewer needs to run, and `sandbox=""`
                  disables it (blank frame). The src is a cross-origin signed storage URL, so the
                  same-origin policy already isolates it from the app's cookies/DOM — the sandbox was
                  redundant for a cross-origin PDF. */}
              <iframe
                src={preview.url}
                title={filename}
                style={{ flex: 1, width: '100%', minHeight: 0, border: '3px solid var(--ink)', background: '#fff' }}
              />
              <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '10px 0 0', textAlign: 'center' }}>
                Le PDF ne s’affiche pas ?{' '}
                <a href={preview.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  Ouvrir dans un nouvel onglet →
                </a>
              </p>
            </div>
          ) : preview.mode === 'text' ? (
            <pre style={textDoc}>{preview.text}</pre>
          ) : preview.mode === 'html' ? (
            <div
              className="ep-doc-preview"
              style={htmlDoc}
              // Sanitized server-side in the docx-preview worker (script/on*/javascript: stripped, D5).
              // .ep-doc-preview restores heading/list/quote styling that Tailwind's preflight strips
              // (item 14) so the docx formatting actually shows.
              dangerouslySetInnerHTML={{ __html: preview.html ?? '' }}
            />
          ) : preview.mode === 'processing' ? (
            <div style={centered}>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Conversion en cours…</p>
              <button type="button" onClick={load} style={retryBtn}>
                Actualiser
              </button>
            </div>
          ) : (
            <div style={centered}>
              <p style={{ fontSize: 15, fontWeight: 700 }}>Aperçu indisponible pour ce format</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 95,
  background: 'rgba(22,19,15,.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const panel: React.CSSProperties = {
  width: 'min(920px, 100%)',
  height: 'min(88vh, 100%)',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  boxShadow: '7px 7px 0 var(--shadow)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  borderBottom: '3px solid var(--ink)',
};

const body: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: 16,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  // Top-aligned + horizontally centered so a tall document GROWS and the body scrolls (small
  // content still centers via each child's own `margin:auto`). Center-aligning here clipped/
  // overflowed tall docs — the white panel couldn't grow past the viewport height.
  alignItems: 'center',
  justifyContent: 'flex-start',
  background: 'var(--paper)',
};

const centered: React.CSSProperties = { margin: 'auto', textAlign: 'center' };

const pdfWrap: React.CSSProperties = {
  alignSelf: 'stretch',
  flex: 1,
  minHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
};

const textDoc: React.CSSProperties = {
  // Size to content (NOT alignSelf:'stretch', which pinned it to the body height and let the text
  // spill out of the white panel); the body scrolls.
  flexShrink: 0,
  width: '100%',
  maxWidth: 720,
  margin: '0 auto',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 8,
  padding: '18px 20px',
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'var(--font-mono, monospace)',
};

const htmlDoc: React.CSSProperties = {
  flexShrink: 0,
  width: '100%',
  maxWidth: 760,
  margin: '0 auto',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 8,
  padding: '24px 28px',
  fontSize: 15,
  lineHeight: 1.75,
  overflowWrap: 'anywhere',
};

const dlLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 12px',
  background: 'var(--card)',
  color: 'var(--ink)',
  textDecoration: 'none',
  minHeight: 40,
  boxSizing: 'border-box',
};

const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--ink2)',
  cursor: 'pointer',
  display: 'inline-flex',
  padding: 6,
  minHeight: 44,
  minWidth: 44,
  alignItems: 'center',
  justifyContent: 'center',
};

const retryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 40,
};
