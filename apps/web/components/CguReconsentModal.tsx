'use client';

// F-13: Re-consent modal — shown when account.needsCguReconsent is true.
// Dismissible only by accepting (blocking prompt per story spec).
// Focus-trapped: this one IS a blocking modal (aria-modal="true").

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '../lib/session';
import { getLegalDocument, recordConsent } from '../lib/api';

export default function CguReconsentModal() {
  const { account, refresh } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acceptBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = account?.needsCguReconsent === true;

  // Focus the accept button when modal opens
  useEffect(() => {
    if (open) {
      acceptBtnRef.current?.focus();
    }
  }, [open]);

  // Minimal focus trap: cycle between all focusable children
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  };

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const doc = await getLegalDocument('cgu');
      await recordConsent({ document: 'cgu', version: doc.version });
      await refresh();
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(22, 19, 15, 0.6)',
          zIndex: 60,
        }}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mise à jour de nos conditions"
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 61,
          width: 'min(540px, calc(100vw - 32px))',
          background: 'var(--card)',
          border: '3px solid var(--border)',
          borderRadius: 8,
          boxShadow: '6px 6px 0 var(--shadow)',
          padding: '32px 36px',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            margin: '0 0 16px',
            color: 'var(--ink)',
          }}
        >
          Mise à jour de nos conditions
        </h2>

        <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Nos{' '}
          <Link
            href="/cgu"
            target="_blank"
            rel="noopener"
            style={{ color: 'var(--accent)', fontWeight: 700 }}
          >
            Conditions générales d&apos;utilisation
          </Link>{' '}
          ont été mises à jour. Veuillez les accepter pour continuer à utiliser Encre &amp; Plume.
        </p>

        {error && (
          <p role="alert" style={{ color: 'var(--accent)', fontSize: 13, margin: '0 0 16px' }}>
            {error}
          </p>
        )}

        <button
          ref={acceptBtnRef}
          onClick={handleAccept}
          disabled={loading}
          className="ep-btn-primary"
          style={{ width: '100%', fontSize: 15 }}
        >
          {loading ? 'Enregistrement…' : "J'accepte"}
        </button>
      </div>
    </>
  );
}
