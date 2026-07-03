// DR-1 — "ANNONCES" ribbon. Replica of prototype ACCUEIL lines 410-420,
// upgraded to a continuous marquee per user request: the track holds two
// copies of the items and slides -50%, so the loop is seamless. Pauses on
// hover; static under prefers-reduced-motion (see globals.css).
import Link from 'next/link';
import type { Announcement } from '@encre-et-plume/shared';
import { ANNOUNCEMENT_LABEL } from '../lib/home';

function ItemList({ items, hidden }: { items: Announcement[]; hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      style={{ display: 'flex', gap: 22, alignItems: 'center', paddingRight: 22, fontWeight: 500 }}
    >
      {items.map((item) => (
        <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 22, whiteSpace: 'nowrap' }}>
          <Link href={item.href} style={{ color: 'inherit', textDecoration: 'none' }} tabIndex={hidden ? -1 : undefined}>
            <b style={{ color: '#fff' }}>{ANNOUNCEMENT_LABEL[item.type]}</b> {item.label}
          </Link>
          <span style={{ opacity: 0.4 }} aria-hidden="true">◆</span>
        </span>
      ))}
    </div>
  );
}

export default function AnnouncementRibbon({ items }: { items: Announcement[] }) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginTop: 20,
        padding: '11px 16px',
        background: '#16130f',
        color: '#f1ece1',
        border: '3px solid var(--ink)',
        borderRadius: 8,
        fontSize: 14,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          letterSpacing: '.1em',
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 5,
          padding: '3px 12px',
          flex: 'none',
        }}
      >
        ANNONCES
      </span>
      <div className="ep-ribbon-viewport" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          className="ep-ribbon-track"
          style={{ ['--ribbon-duration' as string]: `${Math.max(items.length * 9, 18)}s` }}
        >
          <ItemList items={items} />
          <ItemList items={items} hidden />
        </div>
      </div>
    </div>
  );
}
