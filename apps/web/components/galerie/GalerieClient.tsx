'use client';

// DR-5 FE-4 — "Galerie" illustration gallery page composition. Mirror of DecouvrirClient (DR-2):
// URL is the source of truth for category/tri/page; pagination ("Afficher plus de résultats") is
// local state layered on top, same *Inferred* on-brand control DR-2 uses. Trending is an
// independent feed (one failing feed never blanks the grid — DR-1 pattern).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { catalogGenreLabel, galleryCategoryLabel } from '@encre-et-plume/shared';
import type { CollectionCard, GalleryIllustrationCard, GalleryFeatureCard, GalleryPreview, GallerySummary } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { parseGalleryFilters, filtersToGalleryQuery, EMPTY_GALLERY_FILTERS, TRI_LABELS, type GalerieFilters } from '../../lib/gallery';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import GalerieHeader from './GalerieHeader';
import CategoryChips from './CategoryChips';
import SortSelect from './SortSelect';
import GallerySearchInput from './GallerySearchInput';
import GalleryTagFilter from './GalleryTagFilter';
import GalleryGenreFilter from './GalleryGenreFilter';
import TrendingFeature from './TrendingFeature';
import GalleryGrid, { type GalleryGridState } from './GalleryGrid';
import CollectionCardsGrid from './CollectionCardsGrid';
import QuickPreview, { type QuickPreviewState } from './QuickPreview';

const EMPTY_SUMMARY: GallerySummary = { illustrationCount: 0, artistCount: 0 };

export default function GalerieClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseGalleryFilters(new URLSearchParams(searchParams.toString()));
  const facetKey = filtersToGalleryQuery({ ...filters, page: 1 }).toString();

  // DR-12: a `collection` facet filters the grid to one collection's members; the heading names it.
  const [collectionTitle, setCollectionTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!filters.collection) {
      setCollectionTitle(null);
      return;
    }
    let cancelled = false;
    api
      .getCollection(filters.collection)
      .then((d) => !cancelled && setCollectionTitle(d.title))
      .catch(() => !cancelled && setCollectionTitle(null));
    return () => {
      cancelled = true;
    };
  }, [filters.collection]);

  // Any non-default view (search, category, collection, or a changed sort) overrides the "Tendances"
  // feature and relabels the grid "Résultats pour <terms>": title in guillemets, hashtags as #tag,
  // genres + category by their labels, and the sort label when it isn't the default "Tendance".
  const activeTerms = [
    ...(filters.collection && collectionTitle ? [`« ${collectionTitle} »`] : []),
    ...(filters.q ? [`« ${filters.q} »`] : []),
    ...filters.tags.map((t) => `#${t}`),
    ...filters.genre.map((id) => catalogGenreLabel(id)),
    ...(filters.category ? [galleryCategoryLabel(filters.category)] : []),
    ...(filters.tri !== 'tendance' ? [TRI_LABELS[filters.tri]] : []),
  ];
  const isFiltered = activeTerms.length > 0 || !!filters.collection;

  // DR-12 iter2 (FE-8): "Collections" view mode — browse collection œuvres. Only q/genre/hashtag
  // facets apply (D11: no sort/category); the heading names them with "Collections" appended.
  const collectionsMode = !!filters.collectionsMode;
  const collectionSearchTerms = [
    ...(filters.q ? [`« ${filters.q} »`] : []),
    ...filters.tags.map((t) => `#${t}`),
    ...filters.genre.map((id) => catalogGenreLabel(id)),
  ];

  const [items, setItems] = useState<GalleryIllustrationCard[]>([]);
  const [summary, setSummary] = useState<GallerySummary>(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [gridState, setGridState] = useState<GalleryGridState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const [trending, setTrending] = useState<GalleryFeatureCard[]>([]);

  // Collections view (FE-8) — parallel to the illustrations grid, only one is active at a time.
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const [collState, setCollState] = useState<GalleryGridState>('loading');
  const [collPage, setCollPage] = useState(1);
  const [collTotalPages, setCollTotalPages] = useState(1);

  const collectionsQuery = useCallback(
    (pageNum: number) => {
      const p = new URLSearchParams();
      if (filters.q) p.set('q', filters.q);
      if (filters.artist) p.set('artist', filters.artist);
      for (const t of filters.tags) p.append('tags', t);
      for (const g of filters.genre) p.append('genre', g);
      if (pageNum > 1) p.set('page', String(pageNum));
      return p;
    },
    // filters is derived from the URL each render; facetKey drives the effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facetKey],
  );

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<QuickPreviewState>('loading');
  const [preview, setPreview] = useState<GalleryPreview | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Independent feed — a failing trending endpoint never blanks the main grid (DR-1 pattern).
    api.getGalleryTrending().then(setTrending).catch(() => setTrending([]));
  }, []);

  useEffect(() => {
    if (collectionsMode) return; // the collections effect owns this view
    let cancelled = false;
    setGridState('loading');
    api
      .getGallery(new URLSearchParams(facetKey))
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setSummary(res.summary);
        setPage(res.page);
        setTotalPages(res.totalPages);
        setGridState(res.items.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setGridState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey, retryKey, collectionsMode]);

  useEffect(() => {
    if (!collectionsMode) return;
    let cancelled = false;
    setCollState('loading');
    api
      .getCollectionsList(collectionsQuery(1))
      .then((res) => {
        if (cancelled) return;
        setCollections(res.items);
        setCollPage(res.page);
        setCollTotalPages(res.totalPages);
        setCollState(res.items.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setCollState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey, retryKey, collectionsMode]);

  const navigate = useCallback(
    (next: GalerieFilters) => {
      const query = filtersToGalleryQuery(next).toString();
      router.push(`/galerie${query ? `?${query}` : ''}`);
    },
    [router],
  );

  const loadMore = useCallback(async () => {
    const query = new URLSearchParams(facetKey);
    query.set('page', String(page + 1));
    const res = await api.getGallery(query);
    setItems((prev) => [...prev, ...res.items]);
    setPage(res.page);
    setTotalPages(res.totalPages);
  }, [facetKey, page]);

  const collLoadMore = useCallback(async () => {
    const res = await api.getCollectionsList(collectionsQuery(collPage + 1));
    setCollections((prev) => [...prev, ...res.items]);
    setCollPage(res.page);
    setCollTotalPages(res.totalPages);
  }, [collectionsQuery, collPage]);

  // Auto-load: one sentinel drives whichever view is active (illustrations grid or Collections view).
  const hasMore = collectionsMode
    ? collState === 'ready' && collPage < collTotalPages
    : gridState === 'ready' && page < totalPages;
  const sentinelRef = useInfiniteScroll(collectionsMode ? collLoadMore : loadMore, hasMore);

  const openQuickPreview = useCallback((id: string) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setPreviewId(id);
    setPreviewState('loading');
    setPreview(null);
    api
      .getGalleryPreview(id)
      .then((res) => {
        setPreview(res);
        setPreviewState('ready');
      })
      .catch(() => setPreviewState('error'));
  }, []);

  const closeQuickPreview = useCallback(() => {
    setPreviewId(null);
    triggerRef.current?.focus();
  }, []);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 28px 80px' }}>
      <GalerieHeader summary={summary} />

      <div className="ep-gallery-filters" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 26 }}>
        {/* Round 2: search + genre facets (Inferred, no prototype drawing) — same DR-2 layout
            conventions (GallerySearchInput mirrors FilterSidebar's debounced search box;
            GalleryGenreFilter is the same GenreChip/GenreSuggestInput picker). */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <GallerySearchInput
            value={filters.q ?? ''}
            onChange={(q) => navigate({ ...filters, q, page: 1 })}
          />
          <GalleryTagFilter tags={filters.tags} onChange={(tags) => navigate({ ...filters, tags, page: 1 })} />
          <GalleryGenreFilter genre={filters.genre} onChange={(genre) => navigate({ ...filters, genre, page: 1 })} />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <CategoryChips filters={filters} onChange={navigate} />
          <div style={{ flex: 1 }} />
          {/* D11: the sort control is meaningless for collections (fixed publishedAt desc) — hide it. */}
          {!collectionsMode && <SortSelect filters={filters} onChange={navigate} />}
        </div>
      </div>

      {/* Trending is a default-view-only feature — collections mode counts as non-default. */}
      {!collectionsMode && !isFiltered && <TrendingFeature items={trending} onQuickPreview={openQuickPreview} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase' }}>
          {collectionsMode
            ? collectionSearchTerms.length
              ? `Résultats pour ${[...collectionSearchTerms, 'Collections'].join(' · ')}`
              : 'Collections'
            : isFiltered
              ? `Résultats pour ${activeTerms.join(' · ')}`
              : 'Toutes les illustrations'}
        </span>
      </div>

      {collectionsMode ? (
        <CollectionCardsGrid state={collState} items={collections} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : (
        <GalleryGrid
          state={gridState}
          items={items}
          category={filters.category}
          onReset={() => navigate(EMPTY_GALLERY_FILTERS)}
          onRetry={() => setRetryKey((k) => k + 1)}
          onQuickPreview={openQuickPreview}
        />
      )}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          {/* Auto-load sentinel — the observer fires the load-more handler when it enters view; the
              button below stays as an accessible / no-JS fallback. */}
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
          <button
            type="button"
            onClick={collectionsMode ? collLoadMore : loadMore}
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--card)',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '10px 20px',
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--shadow)',
            }}
          >
            Afficher plus de résultats
          </button>
        </div>
      )}

      {previewId && (
        <QuickPreview id={previewId} state={previewState} preview={preview} onClose={closeQuickPreview} />
      )}
    </div>
  );
}
