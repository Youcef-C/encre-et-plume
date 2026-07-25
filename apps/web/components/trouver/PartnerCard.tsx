'use client';

// MC-1 — partner card, replica of prototype TROUVER cards (lines 988-999). Thumb strip + avatar,
// name, role·location line (brush/pen icon, NO emoji — project rule), genre+style chips, and the
// "Profil" (F-3 link) / "Proposer" (MC-3 stub) buttons.
import Link from 'next/link';
import type { PartnerCard as PartnerCardData } from '@encre-et-plume/shared';
import { BrushIcon, PenNibIcon } from '../icons';

const ROLE_LABEL: Record<PartnerCardData['role'], string> = {
  dessinateur: 'Dessinateur·rice',
  scenariste: 'Scénariste',
};

// Halftone fallbacks drawn exactly as the prototype when a portfolio thumb is missing.
const THUMB_FALLBACKS = [
  {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(140deg,var(--ink) 40%,var(--accent) 40%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--ink)',
    backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.5px)',
    backgroundSize: 'var(--dot) var(--dot)',
  },
] as const;

const thumbBox: React.CSSProperties = {
  flex: 1,
  height: 74,
  border: '2px solid var(--ink)',
  borderRadius: 4,
  overflow: 'hidden',
};

const chip: React.CSSProperties = {
  fontSize: 11,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 7px',
};

const button: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '7px 5px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

export default function PartnerCard({
  partner,
  onProposer,
}: {
  partner: PartnerCardData;
  onProposer: (partner: PartnerCardData) => void;
}) {
  const { name, slug, role, location, avatarUrl, portfolioThumbs, genreTags, styleTags } = partner;
  const RoleIcon = role === 'scenariste' ? PenNibIcon : BrushIcon;
  const roleLine = [ROLE_LABEL[role], location].filter(Boolean).join(' · ');

  return (
    <li
      style={{
        listStyle: 'none',
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '5px 5px 0 var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 5, padding: 6 }}>
        {[0, 1].map((i) => {
          const src = portfolioThumbs[i];
          return src ? (
            <img
              key={i}
              src={src}
              alt={`Extrait du portfolio de ${name} (${i + 1})`}
              style={{ ...thumbBox, objectFit: 'cover' }}
            />
          ) : (
            <span key={i} aria-hidden="true" style={{ ...thumbBox, ...THUMB_FALLBACKS[i] }} />
          );
        })}
      </div>

      <div style={{ padding: '6px 13px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '2px solid var(--ink)',
              flex: 'none',
              background: avatarUrl ? `center/cover url(${avatarUrl})` : 'var(--tone)',
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink2)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RoleIcon size={12} />
              {roleLine}
            </div>
          </div>
        </div>

        {(genreTags.length > 0 || styleTags.length > 0) && (
          <div style={{ display: 'flex', gap: 5, margin: '9px 0', flexWrap: 'wrap' }}>
            {[...genreTags, ...styleTags].map((tag) => (
              <span key={tag} style={chip}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 'auto', paddingTop: 9 }}>
          <Link
            href={`/${slug}`}
            aria-label={`Profil de ${name}`}
            className="ep-btn-secondary"
            style={{ ...button, textDecoration: 'none' }}
          >
            Profil
          </Link>
          <button
            type="button"
            onClick={() => onProposer(partner)}
            aria-label={`Proposer une collaboration à ${name}`}
            className="ep-btn-primary"
            style={button}
          >
            Proposer
          </button>
        </div>
      </div>
    </li>
  );
}
