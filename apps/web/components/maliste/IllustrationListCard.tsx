'use client';

// DR-8/DR-9 addendum — illustration card for "Ma liste & coups de cœur"'s Illustrations
// sub-section. Same halftone-cover + title/meta markup as GalleryCard/LikeCard. The optional
// remove ✕ mirrors ListCard's: a sibling of the Link (not nested inside it — a <button> nested
// inside an <a> is invalid HTML and breaks keyboard/AT behavior), same top-right circle button.
import Link from 'next/link';
import type { LikedIllustrationDto } from '@encre-et-plume/shared';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { HeartIcon, XIcon } from '../icons';

export default function IllustrationListCard({
  item,
  onRemove,
}: {
  item: LikedIllustrationDto;
  onRemove?: (id: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Link href={`/illustration/${item.id}`} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
        <div
          style={{
            position: 'relative',
            height: 212,
            border: '3px solid var(--ink)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '4px 4px 0 var(--shadow)',
            ...coverStyle(item.id, item.image),
          }}
          role="img"
          aria-label={item.title}
        />
        <div style={{ fontWeight: 700, marginTop: 9 }}>{item.title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
          {item.artistName} · {item.categoryLabel} ·{' '}
          <span
            aria-label={`${formatLikeCount(item.likeCount)} j'aime`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}
          >
            <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
            {formatLikeCount(item.likeCount)}
          </span>
        </div>
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Retirer ${item.title}`}
          className="ep-malist-remove"
          style={{
            position: 'absolute',
            top: 9,
            right: 9,
            zIndex: 3,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <XIcon size={13} />
        </button>
      )}
    </div>
  );
}
