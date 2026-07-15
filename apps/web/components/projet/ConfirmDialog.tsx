'use client';

// CS-2 card-modal extension — a small on-brand confirmation modal (used for destructive card /
// label actions instead of an inline "Confirmer / Annuler" row). Overlay + centered panel, closes
// on backdrop / Escape, focus moves to the cancel button on open.
//
// Rendered through a portal to <body>: a caller (e.g. a kanban card that is `role="button"`) can sit
// under an ancestor with a CSS `filter`/`transform` — the button hover-brightness transition in
// globals.css is enough — which would become the containing block for this `position:fixed` overlay,
// mispositioning it and making it jitter as the hover-filter animates (Playwright "element is not
// stable"). Portalling to <body> escapes any such ancestor so the overlay is always viewport-centered.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../lib/useScrollLock';

export interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Above the card modal (z-index 70) when nested inside it. */
  zIndex?: number;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  zIndex = 80,
}: ConfirmDialogProps) {
  useScrollLock();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`confirm-${Math.random().toString(36).slice(2)}`).current;

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{
          width: 360,
          maxWidth: '100%',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
          padding: 20,
          boxSizing: 'border-box',
        }}
      >
        <div id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: message ? 8 : 14 }}>
          {title}
        </div>
        {message && <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 16px', lineHeight: 1.5 }}>{message}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 7,
              padding: '8px 16px',
              cursor: 'pointer',
              background: 'var(--card)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              minHeight: 40,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            // B6 (CS-5 iter 6) — the destructive action uses the design-system accent red
            // (--accent #e8261c), not the off-brand muted #c0392b.
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 7,
              padding: '8px 16px',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: '#fff',
              fontFamily: 'inherit',
              minHeight: 40,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
