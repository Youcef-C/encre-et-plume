'use client';

// DR-2 FE-8 — "Découvrir" catalog page composition. Replica of prototype DÉCOUVRIR lines 496-591.
// URL is the source of truth for facet/sort/search filters (F17, shareable/back-navigable);
// pagination ("Afficher plus de résultats") is local component state layered on top — the
// prototype draws no pager, this is an *Inferred* minimal on-brand control (see plan §5 FE-8).
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CatalogWorkCard, TrendingWork, ActiveContest, EditorPickItem, CatalogQuery } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { parseFilters, filtersToQuery, EMPTY_FILTERS } from '../../lib/catalog';
import FilterSidebar from './FilterSidebar';
import ActiveFilters from './ActiveFilters';
import CatalogGrid, { type CatalogGridState } from './CatalogGrid';
import CatalogRail from './CatalogRail';

function useCatalogRail() {
  const [trending, setTrending] = useState<TrendingWork[]>([]);
  const [contest, setContest] = useState<ActiveContest | null>(null);
  const [editorPicks, setEditorPicks] = useState<EditorPickItem[]>([]);

  useEffect(() => {
    // Each rail feed is independent — one failing never blanks the others (DR-1 pattern).
    api.getCatalogTrending().then(setTrending).catch(() => setTrending([]));
    api.getActiveContest().then(setContest).catch(() => setContest(null));
    api.getCatalogEditorPick().then(setEditorPicks).catch(() => setEditorPicks([]));
  }, []);

  return { trending, contest, editorPicks };
}

export default function DecouvrirClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseFilters(new URLSearchParams(searchParams.toString()));
  const facetKey = filtersToQuery({ ...filters, page: 1 }).toString();

  const [items, setItems] = useState<CatalogWorkCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [gridState, setGridState] = useState<CatalogGridState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const rail = useCatalogRail();

  useEffect(() => {
    let cancelled = false;
    setGridState('loading');
    api
      .getCatalog(new URLSearchParams(facetKey))
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
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
    (next: CatalogQuery) => {
      const query = filtersToQuery(next).toString();
      router.push(`/decouvrir${query ? `?${query}` : ''}`);
    },
    [router],
  );

  const loadMore = useCallback(async () => {
    const query = new URLSearchParams(facetKey);
    query.set('page', String(page + 1));
    const res = await api.getCatalog(query);
    setItems((prev) => [...prev, ...res.items]);
    setPage(res.page);
    setTotalPages(res.totalPages);
  }, [facetKey, page]);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 28px 80px', display: 'flex', gap: 24, alignItems: 'flex-start' }} className="ep-catalog-columns">
      <FilterSidebar filters={filters} onChange={navigate} onReset={() => navigate(EMPTY_FILTERS)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 38, textTransform: 'uppercase', margin: 0 }}>Catalogue</h1>
          <span aria-live="polite" style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>
            {total} résultats
          </span>
        </div>

        <ActiveFilters filters={filters} onChange={navigate} />

        <CatalogGrid
          state={gridState}
          items={items}
          onReset={() => navigate(EMPTY_FILTERS)}
          onRetry={() => setRetryKey((k) => k + 1)}
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
      </div>

      <CatalogRail contest={rail.contest} trending={rail.trending} editorPicks={rail.editorPicks} />
    </div>
  );
}
