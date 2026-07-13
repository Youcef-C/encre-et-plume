'use client';

// DR-5 FE-10 — quick-preview overlay ("👁 Aperçu rapide" -> larger image + minimal meta + a path
// into DR-6). role="dialog" aria-modal, Esc + backdrop-click + close-button all dismiss, focus
// moves in on open and returns to the triggering eye button on close (handled by the caller,
// GalerieClient, which remembers the trigger element — same pattern as Paywall's Esc handling).
import { useEffect, useRef } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import Link from 'next/link';
import type { GalleryPreview } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import { XIcon } from '../icons';
import Cover18Overlay from '../age/Cover18Overlay';

export type QuickPreviewState = 'loading' | 'error' | 'ready';

export default function QuickPreview({
  id,
  state,
  preview,
  onClose,
}: {
  id: string;
  state: QuickPreviewState;
  preview: GalleryPreview | null;
  onClose: () => void;
}) {
  useScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const { account } = useSession();
  const cleared = useAgeCleared(account);

  useEffect(() => {
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(22,19,15,.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview?.title ?? 'Aperçu rapide'}
        tabIndex={-1}
        style={{
          position: 'relative',
          background: 'var(--card)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '6px 6px 0 var(--shadow)',
          maxWidth: 480,
          width: '100%',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Round 2 fix: taken fully out of flow (position:absolute, anchored to the dialog panel
            itself, not the scrollable content below) — a `float` disturbed the content's layout
            and shifted around depending on state. Same family of fix as ProfilePageClient's
            AvatarLightbox close button. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1,
            border: '2px solid var(--ink)',
            borderRadius: 6,
            background: 'var(--card)',
            cursor: 'pointer',
            padding: 6,
            boxShadow: '2px 2px 0 var(--shadow)',
          }}
        >
          <XIcon size={16} />
        </button>

        <div style={{ padding: 18, overflowY: 'auto' }}>
          {state === 'loading' && (
            <p role="status" aria-label="Chargement de l'aperçu…" style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ink2)' }}>
              Chargement…
            </p>
          )}

          {state === 'error' && (
            <p role="alert" style={{ padding: '20px 0', textAlign: 'center', color: 'var(--accent)' }}>
              Impossible de charger cet aperçu.
            </p>
          )}

          {state === 'ready' && preview && (
            <>
              <div
                data-testid="quick-preview-cover"
                role="img"
                aria-label={preview.title}
                style={{
                  position: 'relative',
                  height: 320,
                  border: '3px solid var(--ink)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  ...coverStyle(id, preview.image),
                }}
              >
                <Cover18Overlay is18plus={preview.is18plus} cleared={cleared} label="Illustration 18+" />
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, textTransform: 'uppercase', marginTop: 14, lineHeight: 1 }}>
                {preview.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 13 }}>
                <span>
                  par <b>{preview.artistName}</b>
                </span>
                <span style={{ color: '#e8b21c' }}>♥ {formatLikeCount(preview.likeCount)}</span>
                <span style={{ opacity: 0.8 }}>· {preview.categoryLabel}</span>
                <Link
                  href={`/illustration/${preview.id}`}
                  style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Voir l&apos;illustration →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
