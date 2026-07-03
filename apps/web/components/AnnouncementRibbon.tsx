// DR-1 — "ANNONCES" ribbon. Replica of prototype ACCUEIL lines 410-420.
import Link from 'next/link';
import type { Announcement } from '@encre-et-plume/shared';
import { ANNOUNCEMENT_LABEL } from '../lib/home';

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
        flexWrap: 'wrap',
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
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 0, fontWeight: 500 }}>
        {items.map((item, i) => (
          <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Link href={item.href} style={{ color: 'inherit', textDecoration: 'none' }}>
              <b style={{ color: '#fff' }}>{ANNOUNCEMENT_LABEL[item.type]}</b> {item.label}
            </Link>
            {i < items.length - 1 && <span style={{ opacity: 0.4 }}>◆</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
