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
import { useFetchState } from '../../lib/useFetchState';
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

  // CS-13 (R1): an `artist` facet (Account.profileSlug) filters the grid to one artist's illustrations
  // (the DR-6 "Voir tout" target); the heading names them. Fall back to the slug if the profile 404s.
  const [artistName, setArtistName] = useState<string | null>(null);
  useEffect(() => {
    if (!filters.artist) {
      setArtistName(null);
      return;
    }
    const slug = filters.artist;
    let cancelled = false;
    api
      .getProfile(slug)
      .then((p) => !cancelled && setArtistName(p.displayName))
      .catch(() => !cancelled && setArtistName(slug));
    return () => {
      cancelled = true;
    };
  }, [filters.artist]);

  // Any non-default view (search, category, collection, or a changed sort) overrides the "Tendances"
  // feature and relabels the grid "Résultats pour <terms>": title in guillemets, hashtags as #tag,
  // genres + category by their labels, and the sort label when it isn't the default "Tendance".
  const activeTerms = [
    ...(filters.collection && collectionTitle ? [`« ${collectionTitle} »`] : []),
    ...(filters.artist && artistName ? [`Illustrations de ${artistName}`] : []),
    ...(filters.q ? [`« ${filters.q} »`] : []),
    ...filters.tags.map((t) => `#${t}`),
    ...filters.genre.map((id) => catalogGenreLabel(id)),
    ...(filters.category ? [galleryCategoryLabel(filters.category)] : []),
    ...(filters.tri !== 'tendance' ? [TRI_LABELS[filters.tri]] : []),
  ];
  const isFiltered = activeTerms.length > 0 || !!filters.collection || !!filters.artist;

  // DR-12 iter2 (FE-8): "Collections" view mode — browse collection œuvres. Only q/genre/hashtag
  // facets apply (D11: no sort/category); the heading names them with "Collections" appended.
  const collectionsMode = !!filters.collectionsMode;
  const collectionSearchTerms = [
    ...(filters.q ? [`« ${filters.q} »`] : []),
    ...filters.tags.map((t) => `#${t}`),
    ...filters.genre.map((id) => catalogGenreLabel(id)),
  ];

  // DR-14 F16: the trending feed used to swallow its failure into an empty rail
  // (`.catch(() => setTrending([]))`), indistinguishable from "aucune tendance". It now goes through
  // the shared hook: a transient failure retries behind the toast, a terminal one hides the feature.
  const trendingFeed = useFetchState(api.getGalleryTrending, []);
  const trending: GalleryFeatureCard[] = trendingFeed.data ?? [];

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
  const triggerRef = useRef<HTMLElement | null>(null);
  const previewFeed = useFetchState(
    () => (previewId ? api.getGalleryPreview(previewId) : Promise.resolve(null)),
    [previewId],
  );
  const preview: GalleryPreview | null = previewFeed.data;
  const previewState: QuickPreviewState =
    previewFeed.state === 'loading' ? 'loading' : previewFeed.state === 'error' ? 'error' : preview ? 'ready' : 'loading';

  const [appended, setAppended] = useState<{ key: string; items: GalleryIllustrationCard[]; page: number } | null>(null);
  const [collAppended, setCollAppended] = useState<{ key: string; items: CollectionCard[]; page: number } | null>(null);

  // The two views are mutually exclusive: the inactive one resolves to null instead of firing a
  // request, so only one hook is ever in a retry loop.
  const gallery = useFetchState(
    () => (collectionsMode ? Promise.resolve(null) : api.getGallery(new URLSearchParams(facetKey))),
    [facetKey, collectionsMode],
  );
  const collectionsFeed = useFetchState(
    () => (collectionsMode ? api.getCollectionsList(collectionsQuery(1)) : Promise.resolve(null)),
    [facetKey, collectionsMode],
  );

  // Pages appended by "Afficher plus de résultats" / the sentinel, keyed on the facet so a filter
  // change drops them at render time.
  const extra = appended?.key === facetKey ? appended : null;
  const collExtra = collAppended?.key === facetKey ? collAppended : null;

  const items: GalleryIllustrationCard[] = gallery.data ? [...gallery.data.items, ...(extra?.items ?? [])] : [];
  const summary: GallerySummary = gallery.data?.summary ?? EMPTY_SUMMARY;
  const page = extra?.page ?? gallery.data?.page ?? 1;
  const totalPages = gallery.data?.totalPages ?? 1;
  const gridState: GalleryGridState =
    gallery.state === 'loading' ? 'loading' : gallery.state === 'error' ? 'error' : items.length === 0 ? 'empty' : 'ready';

  const collections: CollectionCard[] = collectionsFeed.data ? [...collectionsFeed.data.items, ...(collExtra?.items ?? [])] : [];
  const collPage = collExtra?.page ?? collectionsFeed.data?.page ?? 1;
  const collTotalPages = collectionsFeed.data?.totalPages ?? 1;
  const collState: GalleryGridState =
    collectionsFeed.state === 'loading' ? 'loading' : collectionsFeed.state === 'error' ? 'error' : collections.length === 0 ? 'empty' : 'ready';

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
    setAppended((prev) => ({
      key: facetKey,
      items: [...(prev?.key === facetKey ? prev.items : []), ...res.items],
      page: res.page,
    }));
  }, [facetKey, page]);

  const collLoadMore = useCallback(async () => {
    const res = await api.getCollectionsList(collectionsQuery(collPage + 1));
    setCollAppended((prev) => ({
      key: facetKey,
      items: [...(prev?.key === facetKey ? prev.items : []), ...res.items],
      page: res.page,
    }));
  }, [collectionsQuery, collPage, facetKey]);

  // Auto-load: one sentinel drives whichever view is active (illustrations grid or Collections view).
  const hasMore = collectionsMode
    ? collState === 'ready' && collPage < collTotalPages
    : gridState === 'ready' && page < totalPages;
  const sentinelRef = useInfiniteScroll(collectionsMode ? collLoadMore : loadMore, hasMore);

  const openQuickPreview = useCallback((id: string) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setPreviewId(id);
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
        <CollectionCardsGrid state={collState} items={collections} onRetry={collectionsFeed.retry} />
      ) : (
        <GalleryGrid
          state={gridState}
          items={items}
          category={filters.category}
          onReset={() => navigate(EMPTY_GALLERY_FILTERS)}
          onRetry={gallery.retry}
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
