// DR-3 FE-3 — Synopsis + tag row + roman-only prose excerpt. Replica of ŒUVRE lines 886-891.
// F-22: the tag row is now the work's genre + themes as clickable genre chips -> the Découvrir
// genre facet (freetext work hashtags are no longer rendered — they still feed isMatureContent()).
import { resolveGenreId, type WorkDetail } from '@encre-et-plume/shared';
import { EMPTY_FILTERS, filtersToQuery } from '../../lib/catalog';
import TagChipLink from '../TagChipLink';

const chipStyle: React.CSSProperties = {
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '3px 10px',
};

export default function SynopsisBlock({ work }: { work: WorkDetail }) {
  const showExcerpt = work.format === 'Roman' && !!work.proseExcerpt;
  // genre first, then themes, minus any theme that duplicates the genre.
  const tags = [work.genre, ...(work.themes ?? []).filter((t) => t !== work.genre)];

  return (
    <div>
      <h2 style={{ fontSize: 24, textTransform: 'uppercase', margin: '0 0 10px' }}>Synopsis</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 14px' }}>{work.synopsis}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 26, fontSize: 12, fontWeight: 700 }}>
        {tags.map((tag) => {
          const id = resolveGenreId(tag);
          return id ? (
            <TagChipLink
              key={tag}
              href={`/decouvrir?${filtersToQuery({ ...EMPTY_FILTERS, genre: [id] })}`}
              label={tag}
              ariaLabel={`Filtrer par ${tag}`}
            />
          ) : (
            <span key={tag} style={chipStyle}>
              {tag}
            </span>
          );
        })}
      </div>

      {showExcerpt && (
        <div
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 10,
            background: 'var(--card)',
            boxShadow: '3px 3px 0 var(--shadow)',
            padding: '20px 22px',
            marginBottom: 26,
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: 10 }}>
            Extrait · Chapitre 1
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--ink)' }}>{work.proseExcerpt}</p>
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>
            Lire la suite →
          </div>
        </div>
      )}
    </div>
  );
}
