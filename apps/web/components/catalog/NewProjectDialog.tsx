'use client';

// DR-2 FE-12 — the "Nouveau projet" fork (CS-1) reached from the "＋ Poster une œuvre" button on the
// catalogue. Two option cards: "Manga / Roman" (CS-1, unbuilt → disabled "Bientôt disponible", D19)
// and "Publier une illustration" → /creer/illustration (the DR-5/DR-12 publish flow, which re-enforces
// the creator gate server-side). On-brand focus-trapped dialog (NewCollectionForm pattern).
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { XIcon } from '../icons';

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

const optionCard: React.CSSProperties = {
  textAlign: 'left',
  border: '3px solid var(--ink)',
  borderRadius: 10,
  padding: '16px 18px',
  background: 'var(--card)',
  boxShadow: '4px 4px 0 var(--shadow)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--ink)',
  display: 'block',
  width: '100%',
};

export default function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const titleId = 'new-project-title';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
            return;
          }
          focusTrap(e, dialogRef);
        }}
        style={{
          width: 480,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '3px solid var(--ink)' }}>
          <h2 id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
            Nouveau projet
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Manga / Roman — CS-1 unbuilt (D19). */}
          <button type="button" disabled style={{ ...optionCard, cursor: 'not-allowed', opacity: 0.55, boxShadow: 'none' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', display: 'block' }}>Manga / Roman</span>
            <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 700 }}>Bientôt disponible</span>
          </button>

          {/* Publier une illustration → the DR-5/DR-12 publish flow. */}
          <button type="button" onClick={() => router.push('/creer/illustration')} style={optionCard}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', display: 'block' }}>Publier une illustration</span>
            <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Une œuvre d’illustration, seule ou dans une collection.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
