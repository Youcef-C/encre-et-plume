'use client';

// MC-10 — shared "Bloquer {name} ?" confirmation modal, opened from the three block surfaces
// (profile overflow, DM thread header, contact row). Focus-trapped dialog with the story's
// verbatim effects copy. Modal mechanics copied from InviteModal (the codebase's canonical modal).
import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import type { ApiError } from '@encre-et-plume/shared';
import { createBlock } from '../../lib/api';
import { XIcon } from '../icons';

// Same focus-trap pattern as InviteModal / SupprimerCompteModal.
function focusTrap(e: React.KeyboardEvent, dialogRef: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !dialogRef.current) return;
  const focusable = Array.from(
    dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const footerBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 18px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function BlockConfirmModal({
  user,
  onClose,
  onBlocked,
}: {
  user: { userId: string; name: string };
  onClose: () => void;
  onBlocked: () => void;
}) {
  useScrollLock();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'block-modal-title';
  const errorId = 'block-modal-error';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    focusTrap(e, dialogRef);
  };

  async function handleBlock() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await createBlock({ userId: user.userId, kind: 'block' });
      onBlocked();
    } catch (err) {
      setError((err as ApiError).message ?? 'Une erreur est survenue. Veuillez réessayer.');
      setPending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 440,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
          }}
        >
          <div
            id={titleId}
            style={{ fontFamily: 'var(--font-display)', fontSize: 19, textTransform: 'uppercase', lineHeight: 1 }}
          >
            Bloquer {user.name} ?
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: 'var(--ink)' }}>
            Cette personne ne pourra plus vous envoyer de messages, d&apos;invitations ni de demandes de
            contact. Vous ne verrez plus ses commentaires.
          </p>
          {error && (
            <p id={errorId} role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '12px 0 0' }}>
              {error}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 18px',
            borderTop: '3px solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          <button type="button" onClick={onClose} className="ep-btn-secondary" style={footerBtn}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleBlock()}
            disabled={pending}
            aria-describedby={error ? errorId : undefined}
            className="ep-btn-primary"
            style={{
              ...footerBtn,
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'Blocage…' : 'Bloquer'}
          </button>
        </div>
      </div>
    </div>
  );
}
