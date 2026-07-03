// DR-1 — "Sorties programmées" cards. Replica of prototype ACCUEIL lines 457-464.
import Link from 'next/link';
import type { ScheduledRelease } from '@encre-et-plume/shared';
import { countdownLabel, releaseDateLabel } from '../lib/home';
import { HeartIcon } from './icons';

function coverStyle(seed: number): React.CSSProperties {
  const angles = [150, 40, 200, 110];
  const dark = seed % 3 === 2;
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.4px,transparent 1.5px), linear-gradient(${angles[seed % angles.length]}deg, ${dark ? 'var(--accent) 38%,var(--ink) 38%' : 'var(--ink) 42%,var(--accent) 42%'})`,
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}

export default function ScheduledReleases({
  items,
  now,
}: {
  items: ScheduledRelease[];
  /** Injected for deterministic tests; defaults to real time. */
  now?: Date;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '40px 0 18px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 32, textTransform: 'uppercase', margin: 0 }}>Sorties programmées</h2>
        <Link href="/calendrier" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
          Calendrier →
        </Link>
      </div>

      {items.length === 0 ? (
        <p style={{ color: 'var(--ink2)', fontSize: 14, padding: '16px 0' }}>Aucune sortie programmée pour l&apos;instant.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }} className="ep-scheduled-grid">
          {items.map((item, i) => (
            <Link
              key={item.id}
              href={`/oeuvre/${item.workSlug}`}
              style={{
                display: 'flex',
                gap: 12,
                background: 'var(--card)',
                border: '3px solid var(--ink)',
                borderRadius: 8,
                padding: 12,
                boxShadow: '4px 4px 0 var(--shadow)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ width: 58, flex: 'none', border: '2px solid var(--ink)', borderRadius: 5, ...coverStyle(i) }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{releaseDateLabel(item.releaseAt)}</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{item.workTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  Ch. {item.chapterNumber} · {item.genre}
                </div>
                <div
                  style={{
                    display: 'inline-block',
                    fontSize: 11,
                    border: '2px solid var(--ink)',
                    borderRadius: 5,
                    padding: '2px 8px',
                    marginTop: 8,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {countdownLabel(item.releaseAt, now)} ·
                    <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
