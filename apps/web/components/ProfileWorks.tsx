'use client';

// DR-12 FE-6 — profile "Œuvres publiées" grouping. The creator's collections surface as a grouped
// section of cards (→ the collection Œuvre); their standalone (uncollected) illustrations stay
// ungrouped below (→ the illustration detail). Manga/roman works listing stays out of scope (F-3).
import Link from 'next/link';
import type { ApiError, CollectionSummary, GalleryIllustrationCard } from '@encre-et-plume/shared';
import { collectionMetaLine } from '@encre-et-plume/shared';
import { getProfileCollections } from '../lib/api';
import { apiErrorMessage } from '../lib/apiError';
import { useFetchState } from '../lib/useFetchState';
import { coverStyle } from '../lib/cover';
import { formatLikeCount } from '../lib/home';
import { HeartIcon } from './icons';

type State = 'loading' | 'ready' | 'error';

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  textTransform: 'uppercase',
  margin: '0 0 14px',
};

export default function ProfileWorks({ slug }: { slug: string }) {
  const feed = useFetchState(() => getProfileCollections(slug), [slug]);
  const state: State = feed.state;
  const error = feed.error as ApiError | null;
  const collections: CollectionSummary[] = feed.data?.collections ?? [];
  const illustrations: GalleryIllustrationCard[] = feed.data?.illustrations ?? [];

  if (state === 'loading') {
    return (
      <div role="status" aria-label="Chargement des œuvres…" className="ep-skeleton-delayed">
        <div aria-hidden="true" style={{ height: 120, background: 'var(--tone)', opacity: 0.4, borderRadius: 8 }} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>{apiErrorMessage(error, 'Impossible de charger les œuvres.')}</p>
        <button
          type="button"
          onClick={feed.retry}
          className="ep-btn-primary"
          style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (collections.length === 0 && illustrations.length === 0) {
    return <p style={{ color: 'var(--ink2)', fontSize: 14 }}>Aucune œuvre publiée pour l&apos;instant.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {collections.length > 0 && (
        <section>
          <h3 style={sectionTitle}>Collections</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {collections.map((c) => (
              <Link key={c.id} href={`/oeuvre/${c.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div
                  role="img"
                  aria-label={c.title}
                  style={{ height: 200, border: '3px solid var(--ink)', borderRadius: 8, overflow: 'hidden', boxShadow: '4px 4px 0 var(--shadow)', ...coverStyle(c.id, c.cover) }}
                />
                <b style={{ fontSize: 14, display: 'block', marginTop: 9 }}>{c.title}</b>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
                  {collectionMetaLine(c.count)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {illustrations.length > 0 && (
        <section>
          <h3 style={sectionTitle}>Illustrations</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {illustrations.map((ill) => (
              <Link key={ill.id} href={`/illustration/${ill.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <div
                  role="img"
                  aria-label={ill.title}
                  style={{ height: 200, border: '3px solid var(--ink)', borderRadius: 8, overflow: 'hidden', boxShadow: '4px 4px 0 var(--shadow)', ...coverStyle(ill.id, ill.thumbnail) }}
                />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 9 }}>
                  <b style={{ fontSize: 14 }}>{ill.title}</b>
                  <span
                    aria-label={`${formatLikeCount(ill.likeCount)} j'aime`}
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--ink2)' }}
                  >
                    <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
                    {formatLikeCount(ill.likeCount)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
