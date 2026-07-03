'use client';

// DR-4 FE-6 (F8) — paywall prompt shown when a locked chapter is opened. MR-1/MR-4 (real
// purchase/subscription flow) aren't built yet, so the CTA is a link stub to the work page's
// support section rather than a checkout flow (see plan.md §7 — honest stub, no 404).
import { useEffect } from 'react';
import Link from 'next/link';
import { StarIcon, XIcon } from '../icons';

type Props = {
  chapter: { number: number; title: string | null };
  workSlug: string;
  onClose: () => void;
};

export default function Paywall({ chapter, workSlug, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(22,19,15,.7)',
        zIndex: 40,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ep-paywall-title"
        style={{
          background: 'var(--card)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          borderRadius: 10,
          boxShadow: '6px 6px 0 var(--shadow)',
          padding: 22,
          maxWidth: 340,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            float: 'right',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--ink2)',
            padding: 4,
          }}
        >
          <XIcon size={16} />
        </button>
        <h2 id="ep-paywall-title" style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase', margin: '4px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          Chapitre verrouillé <StarIcon size={16} style={{ color: 'var(--accent)' }} />
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 6px' }}>
          Chapitre {chapter.number}{chapter.title ? ` — ${chapter.title}` : ''}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
          Ce chapitre est réservé aux lecteurs qui soutiennent les auteurs. Débloquez-le en devenant
          soutien du projet.
        </p>
        <Link
          href={`/oeuvre/${workSlug}`}
          style={{
            display: 'inline-block',
            fontWeight: 700,
            fontSize: 13,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '9px 16px',
            textDecoration: 'none',
          }}
        >
          Voir les options de soutien →
        </Link>
      </div>
    </div>
  );
}
