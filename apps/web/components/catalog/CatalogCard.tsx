// DR-2 FE-6 — catalog work card. Replica of prototype DÉCOUVRIR lines 568-576.
'use client';

import Link from 'next/link';
import type { CatalogWorkCard } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import { CheckIcon, BookIcon, HeartIcon } from '../icons';
import Cover18Overlay from '../age/Cover18Overlay';

export default function CatalogCard({ work }: { work: CatalogWorkCard }) {
  const { account } = useSession();
  const cleared = useAgeCleared(account);

  return (
    <Link href={`/oeuvre/${work.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <div
        data-testid="catalog-cover"
        style={{
          position: 'relative',
          height: 212,
          border: '3px solid var(--ink)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '4px 4px 0 var(--shadow)',
          ...coverStyle(work.id, work.cover),
        }}
      >
        <Cover18Overlay is18plus={work.is18plus} cleared={cleared} label="Œuvre 18+" />
        {work.format === 'Roman' && (
          <span
            style={{
              position: 'absolute',
              top: 9,
              left: 9,
              fontSize: 10,
              fontWeight: 700,
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 5,
              padding: '1px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <BookIcon size={11} /> Roman
          </span>
        )}
        {work.complete && (
          <span
            style={{
              position: 'absolute',
              top: 9,
              right: 9,
              fontSize: 10,
              fontWeight: 700,
              background: 'var(--card)',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '1px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <CheckIcon size={11} /> Complet
          </span>
        )}
      </div>
      <div style={{ fontWeight: 700, marginTop: 9 }}>{work.title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
        {work.genre} · {work.chapterCount} ch. ·{' '}
        <span
          aria-label={`${formatLikeCount(work.likeCount)} j'aime`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}
        >
          <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
          {formatLikeCount(work.likeCount)}
        </span>
      </div>
    </Link>
  );
}
