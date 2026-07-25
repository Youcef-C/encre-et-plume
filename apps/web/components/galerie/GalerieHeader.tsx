'use client';

// DR-5 FE-5 — gallery header. Replica of prototype GALERIE lines 596-597: "Galerie" + derived
// "N illustrations · N artistes" summary (Backend rule "counts derived" — not the prototype's
// decorative 128/36 literals) + subtitle + "＋ Publier une illustration" CTA. CS-1: the CTA now
// deep-links into the "Nouveau projet" wizard with the Illustration branch pre-selected
// (/creer?type=illustration); anonymous -> /connexion?next=… (auth gate).
import Link from 'next/link';
import type { GallerySummary } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';

const CREATE_ILLUSTRATION_ROUTE = '/creer?type=illustration';

export default function GalerieHeader({ summary }: { summary: GallerySummary }) {
  const { account } = useSession();
  const ctaHref = account ? CREATE_ILLUSTRATION_ROUTE : `/connexion?next=${encodeURIComponent(CREATE_ILLUSTRATION_ROUTE)}`;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: 0 }}>Galerie</h1>
        <span aria-live="polite" style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>
          {summary.illustrationCount} illustrations · {summary.artistCount} artistes
        </span>
        <Link
          href={ctaHref}
          className="ep-gallery-cta ep-btn-primary"
          style={{
            marginLeft: 'auto',
            alignSelf: 'center',
            fontSize: 13,
            fontWeight: 700,
            border: '2px solid var(--ink)',
            padding: '8px 15px',
            cursor: 'pointer',
            boxShadow: '2px 2px 0 var(--shadow)',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          ＋ Publier une illustration
        </Link>
      </div>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20 }}>
        Toutes les illustrations de la communauté — couvertures, personnages, décors &amp; fan-art.
      </div>
    </div>
  );
}
