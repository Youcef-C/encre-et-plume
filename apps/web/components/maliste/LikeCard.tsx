'use client';

// DR-8 F5 — "Coups de cœur" card. Replica of prototype MA LISTE lines 2042-2047: halftone cover
// with a ♥ badge, title, "{genre} · ♥ {count}" line. Whole card is a Link to the work page [[DR-3]].
import Link from 'next/link';
import type { LikedWorkDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { HeartIcon } from '../icons';

export default function LikeCard({ item }: { item: LikedWorkDto }) {
  return (
    <Link href={`/oeuvre/${item.slug}`} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
      <div
        style={{
          position: 'relative',
          height: 212,
          border: '3px solid var(--ink)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '4px 4px 0 var(--shadow)',
          ...coverStyle(item.slug, item.cover),
        }}
        role="img"
        aria-label={item.title}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 9,
            right: 9,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: '2px solid var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          <HeartIcon size={13} />
        </span>
      </div>
      <div style={{ fontWeight: 700, marginTop: 9 }}>{item.title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
        {item.genre} ·{' '}
        <span
          aria-label={`${formatLikeCount(item.likeCount)} j'aime`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}
        >
          <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
          {formatLikeCount(item.likeCount)}
        </span>
      </div>
    </Link>
  );
}
