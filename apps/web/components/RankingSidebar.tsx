// DR-1 — sidebar "Populaire · Classement de tous les temps". Replica of prototype ACCUEIL lines 476-493.
import Link from 'next/link';
import type { RankingRow } from '@encre-et-plume/shared';

function coverStyle(cover: string | null): React.CSSProperties {
  if (cover) return { backgroundImage: `url(${cover})`, backgroundSize: 'cover' };
  return {
    backgroundColor: 'var(--tone)',
    backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
    backgroundSize: '5px 5px',
  };
}

export default function RankingSidebar({ items }: { items: RankingRow[] }) {
  return (
    <aside
      style={{
        width: '100%',
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '6px 6px 0 var(--shadow)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 16px', background: '#16130f', color: '#f1ece1' }}>
        <span style={{ fontSize: 18 }}>👑</span>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, textTransform: 'uppercase', lineHeight: 1 }}>Populaire</div>
          <div style={{ fontSize: 11, color: '#cabfb2' }}>Classement de tous les temps</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 ? (
          <p style={{ padding: 14, fontSize: 14, color: 'var(--ink2)' }}>Aucun classement pour l&apos;instant.</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/oeuvre/${item.slug}`}
              className="ep-menu-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '10px 14px',
                borderBottom: '2px solid var(--border)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  flex: 'none',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  background: item.rank <= 3 ? 'var(--accent)' : 'var(--paper)',
                  color: item.rank <= 3 ? '#fff' : 'var(--ink)',
                }}
              >
                {item.rank}
              </span>
              <span
                aria-hidden="true"
                style={{ width: 36, height: 48, flex: 'none', border: '2px solid var(--ink)', borderRadius: 4, ...coverStyle(item.cover) }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 14, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </b>
                <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{item.meta}</div>
              </div>
            </Link>
          ))
        )}
        <Link href="/classement" style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--accent)', padding: 12 }}>
          Voir le classement complet →
        </Link>
      </div>
    </aside>
  );
}
