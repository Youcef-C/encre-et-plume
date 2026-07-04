'use client';

// DR-6 FE-T2 (FE-2, FE-10, FE-11) — in-page fullscreen overlay for the artwork. Mirrors QuickPreview's
// a11y pattern (role="dialog" aria-modal, focus-in on open, Esc + backdrop-click + close dismiss).
// Ponytail: an in-page overlay, not the native Fullscreen API (simpler, testable, no cross-instance concern).
import { useEffect, useRef } from 'react';
import type { IllustrationDetail } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { XIcon } from '../icons';

export default function IllustrationFullscreen({ detail, onClose }: { detail: IllustrationDetail; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

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
        zIndex: 60,
        background: 'rgba(22,19,15,.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
        tabIndex={-1}
        style={{ position: 'relative', maxWidth: '92vw', maxHeight: '92dvh', width: '100%', height: '100%' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: -14,
            right: -14,
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
        <div
          role="img"
          aria-label={detail.title}
          style={{ width: '100%', height: '100%', border: '3px solid var(--ink)', borderRadius: 12, ...coverStyle(detail.id, detail.image) }}
        />
      </div>
    </div>
  );
}
