'use client';

// DR-5 FE-9 — gallery grid card. Replica of prototype GALERIE grid cards (lines 632-645):
// 230px halftone tile with a top-right "Aperçu rapide" eye button, title + artist/♥ meta line.
import Link from 'next/link';
import type { GalleryIllustrationCard } from '@encre-et-plume/shared';
import { formatLikeCount } from '../../lib/home';
import { coverStyle } from '../../lib/cover';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import { EyeIcon, HeartIcon } from '../icons';
import Cover18Overlay from '../age/Cover18Overlay';

export default function GalleryCard({
  illustration,
  onQuickPreview,
}: {
  illustration: GalleryIllustrationCard;
  onQuickPreview: (id: string) => void;
}) {
  const { id, title, artistName, artistSlug, likeCount, thumbnail, is18plus } = illustration;
  const { account } = useSession();
  const cleared = useAgeCleared(account);

  return (
    <div style={{ position: 'relative' }}>
      {/* The eye button sits as a sibling of the Link (not nested inside it) — a <button>
          nested inside an <a> is invalid HTML and breaks keyboard/AT behavior. Both share the
          outer div's position:relative coordinate space. */}
      <Link href={`/illustration/${id}`} style={{ color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>
        <div
          data-testid="gallery-cover"
          style={{
            position: 'relative',
            height: 230,
            border: '3px solid var(--ink)',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '4px 4px 0 var(--shadow)',
            ...coverStyle(id, thumbnail),
          }}
          role="img"
          aria-label={title}
        >
          <Cover18Overlay is18plus={is18plus} cleared={cleared} label="Illustration 18+" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9 }}>
          <b style={{ fontSize: 14 }}>{title}</b>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onQuickPreview(id)}
        title="Aperçu rapide"
        aria-label={`Aperçu rapide de ${title}`}
        className="ep-gallery-eye"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 3,
          width: 30,
          height: 30,
          borderRadius: 6,
          border: '2px solid var(--ink)',
          background: 'var(--card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '2px 2px 0 var(--shadow)',
        }}
      >
        <EyeIcon size={15} />
      </button>
      <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
        {artistSlug ? (
          <Link href={`/${artistSlug}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}>
            {artistName}
          </Link>
        ) : (
          artistName
        )}{' '}
        ·{' '}
        <span
          aria-label={`${formatLikeCount(likeCount)} j'aime`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}
        >
          <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
          {formatLikeCount(likeCount)}
        </span>
      </div>
    </div>
  );
}
