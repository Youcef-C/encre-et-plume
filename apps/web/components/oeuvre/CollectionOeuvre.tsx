'use client';

// DR-12 FE-3 — Œuvre "Collection" variant (format === 'Illustration(s)'). Reuses the DR-3 ŒUVRE
// layout but with no chapters/planches branch: the type badge reads "Collection" (substitution of
// the raw 'Illustration(s)' format), the meta is Work.meta ("N illustrations · collection"), the
// primary CTA is "Voir la galerie" → the Galerie filtered to this collection, and the main section
// is the member grid. Owner (∈ team) sees "Gérer la collection".
import Link from 'next/link';
import { resolveGenreId, type WorkDetail, type AccountSummary } from '@encre-et-plume/shared';
import { EMPTY_FILTERS, filtersToQuery } from '../../lib/catalog';
import { coverStyle } from '../../lib/cover';
import { TeamSidebar, FundingGoals } from './Sidebar';
import CollectionGrid from './CollectionGrid';

const badgeStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '2px 9px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const sidebarCard: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '5px 5px 0 var(--shadow)',
  background: 'var(--card)',
};

const actionBase: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 6,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  boxShadow: '3px 3px 0 var(--shadow)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'inherit',
  textDecoration: 'none',
};

export default function CollectionOeuvre({ work, account }: { work: WorkDetail; account: AccountSummary | null }) {
  const items = work.collectionItems ?? [];
  const count = items.length;
  const isOwner = !!account && work.team.some((m) => m.id === account.id);
  const genreId = resolveGenreId(work.genre);

  return (
    <div>
      <Link href="/galerie" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
        ‹ Galerie
      </Link>

      <div style={{ display: 'flex', gap: 26, marginTop: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: 240,
            height: 330,
            flex: 'none',
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '7px 7px 0 var(--shadow)',
            overflow: 'hidden',
            ...coverStyle(work.id, work.cover),
          }}
        />

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
            {genreId ? (
              <Link
                href={`/decouvrir?${filtersToQuery({ ...EMPTY_FILTERS, genre: [genreId] })}`}
                aria-label={`Filtrer par ${work.genre}`}
                className="ep-tag-chip"
                style={{ ...badgeStyle, color: 'var(--ink)', textDecoration: 'none' }}
              >
                {work.genre}
              </Link>
            ) : (
              <span style={badgeStyle}>{work.genre}</span>
            )}
            <span style={{ ...badgeStyle, background: 'var(--accent)', color: '#fff' }}>Collection</span>
          </div>

          <h1 style={{ fontSize: 48, textTransform: 'uppercase', margin: 0, lineHeight: 0.95 }}>{work.title}</h1>
          <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, margin: '8px 0 14px' }}>{work.meta}</div>

          {work.synopsis && (
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)', margin: '0 0 16px', maxWidth: 640 }}>{work.synopsis}</p>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/galerie?collection=${work.id}`} style={{ ...actionBase, background: 'var(--accent)', color: '#fff' }}>
              Voir la galerie
            </Link>
            {isOwner && (
              <Link href={`/collection/${work.id}/gerer`} style={{ ...actionBase, background: 'var(--ink)', color: 'var(--paper)', boxShadow: '3px 3px 0 var(--accent)' }}>
                Gérer la collection
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="ep-oeuvre-columns" style={{ display: 'flex', gap: 26, marginTop: 30, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', margin: 0 }}>Illustrations</h2>
            {count > 0 && (
              <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>{count} · tous disponibles</span>
            )}
          </div>
          <CollectionGrid items={items} />
        </div>

        <aside className="ep-oeuvre-aside" style={{ width: 288, flex: 'none' }}>
          <TeamSidebar team={work.team} account={account} />
          <div style={{ ...sidebarCard, padding: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink2)', marginBottom: 10 }}>DÉTAILS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink2)' }}>Type</span>
                <b>Collection</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink2)' }}>Illustrations</span>
                <b>{count}</b>
              </div>
              {work.themes.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ color: 'var(--ink2)' }}>Genres</span>
                  <b style={{ textAlign: 'right' }}>{[work.genre, ...work.themes].join(' · ')}</b>
                </div>
              )}
            </div>
          </div>
          <FundingGoals goals={work.fundingGoals} />
        </aside>
      </div>
    </div>
  );
}
