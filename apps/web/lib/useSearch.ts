'use client';

import { useState, useEffect } from 'react';
import type { SearchResponse, SearchResultType } from '@encre-et-plume/shared';
import { SEARCH_MIN_QUERY_LENGTH } from '@encre-et-plume/shared';
import { fetchSearch } from './search';

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SearchState {
  status: SearchStatus;
  results: SearchResponse;
  error: unknown;
}

const EMPTY: SearchResponse = { works: [], creators: [], illustrations: [] };
const IDLE: SearchState = { status: 'idle', results: EMPTY, error: null };

export function useSearch(query: string, scope?: SearchResultType): SearchState {
  const [state, setState] = useState<SearchState>(IDLE);

  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_QUERY_LENGTH) {
      setState(IDLE);
      return;
    }

    // ponytail: stale-flag cancel instead of AbortController; functionally identical
    // for this use-case. Add AbortController when the API layer needs it.
    let cancelled = false;

    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const results = await fetchSearch(q, scope);
        if (!cancelled) setState({ status: 'ready', results, error: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', results: EMPTY, error: err });
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, scope]);

  return state;
}
