// DR-7 FE-3 — ranked list row. Replica of prototype CLASSEMENT lines 1081-1090: rank badge
// (top-3 accent, else paper), cover, title + meta, "Lire" action. Title and "Lire" are two
// separate links (no nested interactive elements inside the <li>).
'use client';

import Link from 'next/link';
import type { RankingRow } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import Cover18Overlay from '../age/Cover18Overlay';

export default function RankingList({ items }: { items: RankingRow[] }) {
  const { account } = useSession();
  const cleared = useAgeCleared(account);

  return (
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '6px 6px 0 var(--shadow)',
      }}
    >
      {items.map((item) => (
        <li
          key={item.id}
          aria-label={`Nº${item.rank} · ${item.title}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 18px',
            borderBottom: '2px solid var(--border)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              flex: 'none',
              border: '2px solid var(--ink)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              background: item.rank <= 3 ? 'var(--accent)' : 'var(--paper)',
              color: item.rank <= 3 ? '#fff' : 'var(--ink)',
            }}
          >
            {item.rank}
          </span>
          <div data-testid="ranking-cover" style={{ position: 'relative', width: 52, height: 70, flex: 'none' }}>
            <div
              aria-hidden="true"
              style={{ width: '100%', height: '100%', border: '2px solid var(--ink)', borderRadius: 5, ...coverStyle(item.id, item.cover) }}
            />
            <Cover18Overlay is18plus={item.is18plus} cleared={cleared} label="Œuvre 18+" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href={`/oeuvre/${item.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <b style={{ fontSize: 17 }}>{item.title}</b>
            </Link>
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>{item.meta}</div>
          </div>
          <Link
            href={`/oeuvre/${item.slug}`}
            aria-label={`Lire — ${item.title}`}
            className="ep-lire-pill"
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '7px 14px',
              flex: 'none',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            Lire
          </Link>
        </li>
      ))}
    </ol>
  );
}
