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
import Link from 'next/link';
import { useScrollLock } from '../../lib/useScrollLock';

// The optional props below are a deliberate, and now CLOSED, set: `confirmIntent` (CS-20 — the confirm
// is not always destructive), `confirmHref` (CS-20 — « Créer une version… » is a navigation, so it must
// be a real link, middle-clickable) and `secondaryLabel`/`onSecondary` (CS-20 — an offer with THREE real
// answers, where Escape must mean "cancel", never "do the thing"). A fourth flag is the signal that the
// next caller wants a different dialog, not another branch of this one: build that one instead.
export interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** The action is impossible right now (e.g. CS-7 R2-6: the chapter still holds cards) — state the
   *  blocker and offer no destroy button rather than one that would 409. */
  blocked?: boolean;
  /** Above the card modal (z-index 70) when nested inside it. */
  zIndex?: number;
  /** CS-20 D-4 — the confirm button's intent class. Destructive confirms (every pre-CS-20 caller)
   *  stay `danger`; a POSITIVE confirm such as the handoff offer passes `success`. */
  confirmIntent?: 'danger' | 'success';
  /** CS-20 D-10 — the confirm is a NAVIGATION (« Créer une version… » goes to the editor): render it
   *  as a real link so it keeps an href, middle-click and the browser's own affordances. */
  confirmHref?: string;
  /** CS-20 D-10 — a third choice between « Annuler » and the confirm, so dismissing the dialog
   *  (Escape / backdrop) can stay the harmless one. Both must be given or neither. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  onCancel,
  blocked = false,
  zIndex = 80,
  confirmIntent = 'danger',
  confirmHref,
  secondaryLabel,
  onSecondary,
}: ConfirmDialogProps) {
  const confirmClass = confirmIntent === 'success' ? 'ep-btn-success' : 'ep-btn-danger';
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
          // A three-action dialog gets the wider panel so its buttons fit one row (feedback
          // 2026-09-01); flexWrap still lets them stack on narrow viewports.
          width: secondaryLabel ? 440 : 360,
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="ep-btn-secondary"
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 7,
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 44,
            }}
          >
            {blocked ? 'Fermer' : cancelLabel}
          </button>
          {!blocked && secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className="ep-btn-secondary" style={actionStyle}>
              {secondaryLabel}
            </button>
          )}
          {/* Per the shared button scheme the colour is an INTENT, never a caller's ad-hoc style:
              destructive confirmations (Révoquer / Supprimer — the default) are always danger, and
              CS-20's positive confirm is the one documented exception (`success`). Nothing inline. */}
          {!blocked &&
            (confirmHref ? (
              <Link href={confirmHref} onClick={onConfirm} className={confirmClass} style={{ ...actionStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                {confirmLabel}
              </Link>
            ) : (
              <button type="button" onClick={onConfirm} className={confirmClass} style={actionStyle}>
                {confirmLabel}
              </button>
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Layout only — every colour comes from the `.ep-btn-*` intent class on the element. */
const actionStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 7,
  padding: '8px 16px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
  boxShadow: '2px 2px 0 var(--shadow)',
};
