'use client';

// User feedback 2026-09-01 — creating a version is no longer a blind one-click: this confirm modal
// shows the content that becomes the new version's base and carries the optional note (the Item 22
// chevron popover is superseded). Same portal/overlay/Escape idiom as ConfirmDialog — that prop set
// is deliberately closed, so this is its sibling, not another branch.
//
// The preview is PLAIN TEXT (editor.getText()): raw editor HTML must never reach an innerHTML sink
// (see VersionSheet.tsx — the only sanctioned HTML source is the server-sanitized review endpoint).
// ponytail: text-only preview; a faithful A4 render = a read-only TipTap fed getJSON(), add if asked.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';

export default function SnapshotConfirmModal({
  version,
  previewText,
  snapping,
  onConfirm,
  onCancel,
}: {
  /** The current head version — the modal announces v{version} → v{version + 1}. Pass 0 for a
   *  not-yet-materialized card: the modal announces « v1 » (first version) and hides the note field
   *  (v1 is cut by the save itself, which carries no note). */
  version: number;
  previewText: string;
  snapping: boolean;
  onConfirm: (note?: string) => void;
  onCancel: () => void;
}) {
  useScrollLock();
  const [note, setNote] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(22,19,15,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enregistrer une nouvelle version"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{ width: 520, maxWidth: '100%', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '7px 7px 0 var(--shadow)', padding: 20, boxSizing: 'border-box' }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: 4 }}>
          Enregistrer une nouvelle version
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10 }}>
          {version === 0 ? 'v1' : `v${version} → v${version + 1}`}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 4 }}>
          Contenu de la version
        </div>
        <div style={{ maxHeight: '40vh', overflow: 'auto', border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--paper)', padding: '8px 10px', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--ink)', marginBottom: 12 }}>
          {previewText.trim() || '(Document vide)'}
        </div>
        {version > 0 && (
          <>
            <label htmlFor="ep-version-note" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>NOTE (optionnelle)</label>
            <textarea
              id="ep-version-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Décrivez cette version…"
              rows={2}
              style={{ width: '100%', marginTop: 4, marginBottom: 14, border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' }}
            />
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button ref={cancelRef} type="button" onClick={onCancel} className="ep-btn-secondary" style={{ padding: '9px 16px', minHeight: 40 }}>
            Annuler
          </button>
          <button
            type="button"
            disabled={snapping}
            onClick={() => onConfirm(note.trim() || undefined)}
            className="ep-btn-success"
            style={{ padding: '9px 16px', minHeight: 40 }}
          >
            {snapping ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
