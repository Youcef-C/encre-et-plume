// DR-6 FE-T3 (FE-4) — meta block. Replica of prototype ILLUSTRATION lines 675-683: title, byline
// (artist · category · ♥), description paragraph (omitted when null), hashtag chips.
// F-22: two visually-distinct tag layers — controlled genre chips (-> /galerie?genre=<id> facet)
// and freetext `#hashtag` chips (-> /galerie?tag=<tag> search).
import { resolveGenreId, type IllustrationDetail } from '@encre-et-plume/shared';
import { EMPTY_GALLERY_FILTERS, filtersToGalleryQuery } from '../../lib/gallery';
import { formatLikeCount } from '../../lib/home';
import { HeartIcon } from '../icons';
import TagChipLink from '../TagChipLink';

const chipStyle: React.CSSProperties = {
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '3px 10px',
  fontSize: 12,
  fontWeight: 700,
};

export default function IllustrationMeta({ detail }: { detail: IllustrationDetail }) {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, textTransform: 'uppercase', margin: '18px 0 4px', lineHeight: 1 }}>
        {detail.title}
      </h1>
      <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginBottom: 14 }}>
        par <b style={{ color: 'var(--ink)' }}>{detail.artist.name}</b> · <span>{detail.categoryLabel}</span> ·{' '}
        <span
          aria-label={`${formatLikeCount(detail.likeCount)} j'aime`}
          style={{ color: 'var(--accent)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}
        >
          <HeartIcon size={12} /> {formatLikeCount(detail.likeCount)}
        </span>
      </div>
      {detail.description && (
        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 14px' }}>{detail.description}</p>
      )}
      {(detail.genres ?? []).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(detail.genres ?? []).map((label) => {
            const id = resolveGenreId(label);
            return id ? (
              <TagChipLink
                key={label}
                href={`/galerie?${filtersToGalleryQuery({ ...EMPTY_GALLERY_FILTERS, genre: [id] })}`}
                label={label}
                ariaLabel={`Filtrer par ${label}`}
              />
            ) : (
              <span key={label} style={chipStyle}>
                {label}
              </span>
            );
          })}
        </div>
      )}
      {detail.hashtags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 30 }}>
          {detail.hashtags.map((tag) => (
            <TagChipLink
              key={tag}
              href={`/galerie?${filtersToGalleryQuery({ ...EMPTY_GALLERY_FILTERS, tags: [tag] })}`}
              label={`#${tag}`}
              ariaLabel={`Rechercher le hashtag #${tag}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
