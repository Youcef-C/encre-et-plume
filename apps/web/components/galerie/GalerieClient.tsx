'use client';

// DR-5 FE-4 — "Galerie" illustration gallery page composition. Mirror of DecouvrirClient (DR-2):
// URL is the source of truth for category/tri/page; pagination ("Afficher plus de résultats") is
// local state layered on top, same *Inferred* on-brand control DR-2 uses. Trending is an
// independent feed (one failing feed never blanks the grid — DR-1 pattern).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GalleryIllustrationCard, GalleryFeatureCard, GalleryPreview, GalleryQuery, GallerySummary } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { parseGalleryFilters, filtersToGalleryQuery, EMPTY_GALLERY_FILTERS } from '../../lib/gallery';
import GalerieHeader from './GalerieHeader';
import CategoryChips from './CategoryChips';
import SortSelect from './SortSelect';
import GallerySearchInput from './GallerySearchInput';
import GalleryTagFilter from './GalleryTagFilter';
import GalleryGenreFilter from './GalleryGenreFilter';
import TrendingFeature from './TrendingFeature';
import GalleryGrid, { type GalleryGridState } from './GalleryGrid';
import QuickPreview, { type QuickPreviewState } from './QuickPreview';

const EMPTY_SUMMARY: GallerySummary = { illustrationCount: 0, artistCount: 0 };

export default function GalerieClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseGalleryFilters(new URLSearchParams(searchParams.toString()));
  const facetKey = filtersToGalleryQuery({ ...filters, page: 1 }).toString();

  const [items, setItems] = useState<GalleryIllustrationCard[]>([]);
  const [summary, setSummary] = useState<GallerySummary>(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [gridState, setGridState] = useState<GalleryGridState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const [trending, setTrending] = useState<GalleryFeatureCard[]>([]);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<QuickPreviewState>('loading');
  const [preview, setPreview] = useState<GalleryPreview | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Independent feed — a failing trending endpoint never blanks the main grid (DR-1 pattern).
    api.getGalleryTrending().then(setTrending).catch(() => setTrending([]));
  }, []);

  useEffect(() => {
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
  }, [facetKey, retryKey]);

  const navigate = useCallback(
    (next: GalleryQuery) => {
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
          <GalleryTagFilter tag={filters.tag} onChange={(tag) => navigate({ ...filters, tag, page: 1 })} />
          <GalleryGenreFilter genre={filters.genre} onChange={(genre) => navigate({ ...filters, genre, page: 1 })} />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <CategoryChips filters={filters} onChange={navigate} />
          <div style={{ flex: 1 }} />
          <SortSelect filters={filters} onChange={navigate} />
        </div>
      </div>

      <TrendingFeature items={trending} onQuickPreview={openQuickPreview} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase' }}>
          Toutes les illustrations
        </span>
      </div>

      <GalleryGrid
        state={gridState}
        items={items}
        category={filters.category}
        onReset={() => navigate(EMPTY_GALLERY_FILTERS)}
        onRetry={() => setRetryKey((k) => k + 1)}
        onQuickPreview={openQuickPreview}
      />

      {gridState === 'ready' && page < totalPages && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            type="button"
            onClick={loadMore}
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
