// DR-2 FE-7 — right rail: "Actualités" concours card, "En vogue cette semaine" top-3,
// "SÉLECTION ÉDITEUR". Replica of prototype DÉCOUVRIR lines 578-589.
import Link from 'next/link';
import type { TrendingWork, ActiveContest, EditorPickItem } from '@encre-et-plume/shared';
import { ArrowUpIcon } from '../icons';

function thumbStyle(seed: number): React.CSSProperties {
  const dark = seed % 2 === 1;
  const angle = [150, 40, 75][seed % 3];
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.3px,transparent 1.4px), linear-gradient(${angle}deg, ${dark ? 'var(--accent) 38%,var(--ink) 38%' : 'var(--ink) 40%,var(--accent) 40%'})`,
    backgroundSize: '5px 5px, cover',
  };
}

export default function CatalogRail({
  contest,
  trending,
  editorPicks,
}: {
  contest: ActiveContest | null;
  trending: TrendingWork[];
  editorPicks: EditorPickItem[];
}) {
  return (
    <aside className="ep-catalog-rail" style={{ width: 252, flex: 'none', position: 'sticky', top: 88 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase', marginBottom: 12 }}>Actualités</div>

      {contest && (
        <div
          style={{
            border: '3px solid var(--ink)',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '4px 4px 0 var(--shadow)',
            background: 'var(--card)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              height: 72,
              borderBottom: '3px solid var(--ink)',
              backgroundColor: 'var(--accent)',
              backgroundImage: 'radial-gradient(rgba(22,19,15,.45) 1.5px,transparent 1.6px), linear-gradient(135deg,var(--ink) 36%,var(--accent) 36%)',
              backgroundSize: 'var(--dot) var(--dot), cover',
            }}
          />
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--accent)' }}>{contest.category}</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 3px' }}>{contest.title}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{contest.subtitle}</div>
            <Link
              href={contest.href}
              style={{
                display: 'block',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 700,
                border: '2px solid var(--ink)',
                borderRadius: 6,
                padding: 6,
                marginTop: 9,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              {contest.ctaLabel}
            </Link>
          </div>
        </div>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', marginBottom: 11 }}>
        En vogue cette semaine
      </div>
      {trending.map((item, i) => (
        <Link
          key={item.id}
          href={`/oeuvre/${item.slug}`}
          style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11, color: 'inherit', textDecoration: 'none' }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--accent)', width: 14 }}>{item.rank}</span>
          <span aria-hidden="true" style={{ width: 30, height: 40, border: '2px solid var(--ink)', borderRadius: 3, flex: 'none', ...thumbStyle(i) }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              {item.genre} · <ArrowUpIcon size={10} /> {item.growthPct}%
            </div>
          </div>
        </Link>
      ))}

      {editorPicks.length > 0 && (
        <div style={{ border: '3px dashed var(--ink)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--ink2)' }}>SÉLECTION ÉDITEUR</div>
          {editorPicks.map((pick) => (
            <div key={pick.id} style={{ fontSize: 13, marginTop: 3, lineHeight: 1.3 }}>
              {pick.blurb}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
