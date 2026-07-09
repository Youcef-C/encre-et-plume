'use client';

// DR-12 FE-3 — collection member grid. Focusable illustration links (→ DR-6), halftone-fallback
// cover tiles with alt text, title + ♥ count. Reflows via auto-fill so it works at 375/768/1280.
import Link from 'next/link';
import type { CollectionItemDto } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { HeartIcon } from '../icons';

export default function CollectionGrid({ items }: { items: CollectionItemDto[] }) {
  if (items.length === 0) {
    return (
      <p style={{ color: 'var(--ink2)', fontSize: 15, fontWeight: 500, padding: '18px 0' }}>Aucune illustration</p>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
      {items.map((item) => (
        <Link key={item.id} href={`/illustration/${item.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          <div
            role="img"
            aria-label={item.title}
            style={{
              height: 200,
              border: '3px solid var(--ink)',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '4px 4px 0 var(--shadow)',
              ...coverStyle(item.id, item.thumbnail),
            }}
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9 }}>
            <b style={{ fontSize: 14 }}>{item.title}</b>
            <span
              aria-label={`${formatLikeCount(item.likeCount)} j'aime`}
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--ink2)' }}
            >
              <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
              {formatLikeCount(item.likeCount)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
