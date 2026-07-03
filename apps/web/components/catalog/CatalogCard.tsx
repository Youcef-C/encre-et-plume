// DR-2 FE-6 — catalog work card. Replica of prototype DÉCOUVRIR lines 568-576.
import Link from 'next/link';
import type { CatalogWorkCard } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { CheckIcon, BookIcon, HeartIcon } from '../icons';

/** Deterministic halftone gradient from the work id (no covers uploaded yet — CSS placeholder). */
function coverStyle(work: CatalogWorkCard): React.CSSProperties {
  if (work.cover) return { backgroundImage: `url(${work.cover})`, backgroundSize: 'cover' };
  const hash = [...work.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dark = hash % 3 === 2;
  const angle = [125, 215, 60, 150, 40, 75][hash % 6];
  return {
    backgroundColor: dark ? 'var(--ink)' : 'var(--accent)',
    backgroundImage: `radial-gradient(rgba(${dark ? '255,255,255,.16' : '22,19,15,.5'}) 1.5px,transparent 1.6px), linear-gradient(${angle}deg, ${dark ? 'var(--accent) 40%,var(--ink) 40%' : 'var(--ink) 42%,var(--accent) 42%'})`,
    backgroundSize: 'var(--dot) var(--dot), cover',
  };
}

export default function CatalogCard({ work }: { work: CatalogWorkCard }) {
  return (
    <Link href={`/oeuvre/${work.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
      <div
        style={{
          position: 'relative',
          height: 212,
          border: '3px solid var(--ink)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '4px 4px 0 var(--shadow)',
          ...coverStyle(work),
        }}
      >
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
