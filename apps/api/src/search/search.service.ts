import { Inject, Injectable } from '@nestjs/common';
import type { SearchResponse, SearchResultType } from '@encre-et-plume/shared';
import { SEARCH_MIN_QUERY_LENGTH } from '@encre-et-plume/shared';
import { SEARCH_PROVIDERS, type SearchProvider } from './search.providers';

const SEARCH_LIMIT = 8;
const EMPTY: SearchResponse = { works: [], creators: [], illustrations: [] };

@Injectable()
export class SearchService {
  constructor(@Inject(SEARCH_PROVIDERS) private readonly providers: SearchProvider[]) {}

  async search(query: string, accountId: string, scope?: SearchResultType): Promise<SearchResponse> {
    const q = (query ?? '').trim();
    if (q.length < SEARCH_MIN_QUERY_LENGTH) return { ...EMPTY };

    const ctx = { accountId, limit: SEARCH_LIMIT };
    const active = scope ? this.providers.filter((p) => p.type === scope) : this.providers;

    const result: SearchResponse = { works: [], creators: [], illustrations: [] };
    await Promise.all(active.map(async (p) => { result[p.type] = await p.search(q, ctx); }));
    return result;
  }
}
