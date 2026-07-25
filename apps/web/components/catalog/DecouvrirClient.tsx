'use client';

// DR-2 FE-8 — "Découvrir" catalog page composition. Replica of prototype DÉCOUVRIR lines 496-591.
// URL is the source of truth for facet/sort/search filters (F17, shareable/back-navigable);
// pagination ("Afficher plus de résultats") is local component state layered on top — the
// prototype draws no pager, this is an *Inferred* minimal on-brand control (see plan §5 FE-8).
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CatalogWorkCard, TrendingWork, ActiveContest, EditorPickItem, CatalogQuery } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { parseFilters, filtersToQuery, EMPTY_FILTERS } from '../../lib/catalog';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
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

  // FE-12: "＋ Poster une œuvre" is creator-only. Reuse the D-FE1 gate — the account's profile carries
  // creatorRoles; the button renders nothing for anonymous/loading/non-creator visitors (D25). The
  // publish flow re-enforces the gate server-side, so this is presentation only.
  const { account } = useSession();
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    if (!account?.slug) {
      setIsCreator(false);
      return;
    }
    let cancelled = false;
    api
      .getProfile(account.slug)
      .then((p) => !cancelled && setIsCreator((p.creatorRoles ?? []).length > 0))
      .catch(() => !cancelled && setIsCreator(false));
    return () => {
      cancelled = true;
    };
  }, [account?.slug]);

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

  const hasMore = gridState === 'ready' && page < totalPages;
  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 28px 80px', display: 'flex', gap: 24, alignItems: 'flex-start' }} className="ep-catalog-columns">
      <FilterSidebar filters={filters} onChange={navigate} onReset={() => navigate(EMPTY_FILTERS)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 38, textTransform: 'uppercase', margin: 0 }}>Catalogue</h1>
          <span aria-live="polite" style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>
            {total} résultats
          </span>
          {isCreator && (
            <button
              type="button"
              onClick={() => router.push('/creer')}
              className="ep-btn-primary"
              style={{
                marginLeft: 'auto',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 8,
                padding: '10px 18px',
                minHeight: 44,
                cursor: 'pointer',
                boxShadow: '4px 4px 0 var(--shadow)',
                fontFamily: 'inherit',
              }}
            >
              ＋ Poster une œuvre
            </button>
          )}
        </div>

        <ActiveFilters filters={filters} onChange={navigate} />

        <CatalogGrid
          state={gridState}
          items={items}
          onReset={() => navigate(EMPTY_FILTERS)}
          onRetry={() => setRetryKey((k) => k + 1)}
        />

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            {/* Auto-load sentinel — the observer fires loadMore when it enters view; the button below
                stays as an accessible / no-JS fallback. */}
            <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
            <button
              type="button"
              onClick={loadMore}
              className="ep-btn-secondary"
              style={{
                fontSize: 13,
                fontWeight: 700,
                border: '2px solid var(--ink)',
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
