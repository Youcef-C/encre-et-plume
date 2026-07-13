'use client';

// F-14: Account deletion confirmation modal.
// Focus-trapped, requires typing "SUPPRIMER" + password before enabling submit.
// On success: clears session + redirects to /compte-supprime.

import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../lib/useScrollLock';
import { useRouter } from 'next/navigation';
import { useSession } from '../lib/session';
import { deleteAccount } from '../lib/api';
import type { ApiError } from '@encre-et-plume/shared';

const CONFIRM_WORD = 'SUPPRIMER';

// Reuse the same focus-trap pattern as CguReconsentModal
function focusTrap(e: React.KeyboardEvent, dialogRef: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !dialogRef.current) return;
  const focusable = Array.from(
    dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

export default function SupprimerCompteModal() {
  const { logout } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  useScrollLock(open);
  const [confirmWord, setConfirmWord] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = confirmWord === CONFIRM_WORD && password.length > 0;

  // Focus first input when modal opens
  useEffect(() => {
    if (open) {
      firstInputRef.current?.focus();
    }
  }, [open]);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setConfirmWord('');
    setPassword('');
    setError(null);
    // Return focus to trigger
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
      return;
    }
    focusTrap(e, dialogRef);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteAccount(password);
      // Hard navigation, no client logout(): the API already cleared the session cookie,
      // and any client-state change re-renders /parametres whose auth guard races the
      // router toward /connexion. A full page load tears React down — no race possible.
      window.location.assign('/compte-supprime');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.message ?? 'Une erreur est survenue. Veuillez réessayer.');
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Trigger button — destructive accent styling */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="ep-btn-primary"
        style={{
          fontSize: 14,
          padding: '10px 18px',
        }}
      >
        Supprimer mon compte
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div
            aria-hidden="true"
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(22, 19, 15, 0.65)',
              zIndex: 60,
            }}
          />

          {/* Modal */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 61,
              width: 'min(520px, calc(100vw - 32px))',
              maxHeight: 'calc(100dvh - 48px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--card)',
              border: '3px solid var(--ink)',
              borderRadius: 8,
              boxShadow: '6px 6px 0 var(--shadow)',
            }}
          >
            <div style={{ flex: 'none', padding: '24px 32px 16px', borderBottom: '2px solid var(--border)' }}>
              <h2
                id="delete-account-title"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  margin: 0,
                  color: 'var(--accent)',
                }}
              >
                Supprimer mon compte
              </h2>
            </div>

            {/* Flex form: consequences + fields scroll, the action buttons stay pinned. */}
            <form onSubmit={(e) => void handleSubmit(e)} noValidate style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
              <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '18px 32px' }}>
              {/* Consequences — screen-reader readable list */}
              <p style={{ fontSize: 14, color: 'var(--ink)', margin: '0 0 8px', fontWeight: 700 }}>
                Conséquences irrévocables :
              </p>
              <ul
                style={{
                  margin: '0 0 20px 18px',
                  padding: 0,
                  fontSize: 14,
                  color: 'var(--ink)',
                  lineHeight: 1.65,
                }}
              >
                <li>Profil supprimé</li>
                <li>Œuvres et contributions anonymisées ou retirées</li>
                <li>Abonnements arrêtés</li>
                <li>Données de paiement conservées le temps légal</li>
              </ul>

              {/* Confirmation word */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="delete-confirm-word"
                  className="ep-label"
                >
                  Tapez « SUPPRIMER » pour confirmer
                </label>
                <input
                  ref={firstInputRef}
                  id="delete-confirm-word"
                  type="text"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  className="ep-input"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={error ? 'delete-error' : undefined}
                  aria-invalid={confirmWord.length > 0 && confirmWord !== CONFIRM_WORD ? 'true' : undefined}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="delete-password" className="ep-label">
                  Mot de passe
                </label>
                <input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ep-input"
                  autoComplete="current-password"
                  aria-describedby={error ? 'delete-error' : undefined}
                />
              </div>

              {/* Error */}
              {error && (
                <p
                  id="delete-error"
                  role="alert"
                  className="ep-error"
                  style={{ marginBottom: 14 }}
                >
                  {error}
                </p>
              )}
              </div>

              {/* Actions */}
              <div style={{ flex: 'none', display: 'flex', gap: 10, flexWrap: 'wrap', padding: '14px 32px', borderTop: '2px solid var(--border)', background: 'var(--paper)' }}>
                <button
                  type="submit"
                  className="ep-btn-primary"
                  disabled={!canSubmit || submitting}
                  style={{ flex: 1, fontSize: 14 }}
                >
                  {submitting ? 'Suppression en cours…' : 'Confirmer la suppression'}
                </button>
                <button
                  type="button"
                  className="ep-btn-secondary"
                  onClick={handleClose}
                  disabled={submitting}
                  style={{ flex: 1, fontSize: 14 }}
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
