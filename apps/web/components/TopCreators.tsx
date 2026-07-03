// DR-1 — "Top artiste" + "Top scénariste du moment" cards. Replica of prototype ACCUEIL lines 445-455.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TopCreator, TopCreatorsResponse } from '@encre-et-plume/shared';
import { BrushIcon, PenNibIcon } from './icons';

function avatarStyle(avatar: string | null): React.CSSProperties {
  if (avatar) return { backgroundImage: `url(${avatar})`, backgroundSize: 'cover' };
  return {
    backgroundColor: 'var(--tone)',
    backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
    backgroundSize: '5px 5px',
  };
}

function CreatorCard({
  label,
  icon,
  headerBg,
  headerColor,
  roleLabel,
  creator,
}: {
  label: string;
  icon: ReactNode;
  headerBg: string;
  headerColor: string;
  roleLabel: string;
  creator: TopCreator | null;
}) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '6px 6px 0 var(--shadow)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: headerBg, color: headerColor }}>
        {icon}
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', lineHeight: 1 }}>{label}</div>
      </div>
      {creator ? (
        <Link
          href={`/${creator.slug}`}
          className="ep-menu-item"
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, color: 'inherit', textDecoration: 'none' }}
        >
          <span
            aria-hidden="true"
            style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid var(--ink)', flex: 'none', ...avatarStyle(creator.avatar) }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 16 }}>{creator.name}</b>
            <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{roleLabel}</div>
          </div>
        </Link>
      ) : (
        <p style={{ padding: 14, fontSize: 14, color: 'var(--ink2)' }}>Pas encore de créateur·rice à l&apos;honneur.</p>
      )}
    </div>
  );
}

export default function TopCreators({ data }: { data: TopCreatorsResponse }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, margin: '34px 0 8px' }} className="ep-top-creators">
      <CreatorCard
        label="Top artiste du moment"
        icon={<BrushIcon size={17} />}
        headerBg="var(--accent)"
        headerColor="#fff"
        roleLabel="Dessinateur·rice"
        creator={data.artist}
      />
      <CreatorCard
        label="Top scénariste du moment"
        icon={<PenNibIcon size={17} />}
        headerBg="#16130f"
        headerColor="#f1ece1"
        roleLabel="Scénariste"
        creator={data.scenarist}
      />
    </div>
  );
}
