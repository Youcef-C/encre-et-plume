import { describe, it, expect } from 'vitest';
import { SEARCH_GROUP_LABEL, GROUP_ORDER, totalResults } from '../lib/search';
import type { SearchResponse } from '@encre-et-plume/shared';

describe('lib/search — labels and helpers', () => {
  it('has French label for works', () => {
    expect(SEARCH_GROUP_LABEL.works).toBe('Œuvres');
  });

  it('has French label for creators', () => {
    expect(SEARCH_GROUP_LABEL.creators).toBe('Créateur·rices');
  });

  it('has French label for illustrations', () => {
    expect(SEARCH_GROUP_LABEL.illustrations).toBe('Illustrations');
  });

  it('GROUP_ORDER covers all result types in the right order', () => {
    expect(GROUP_ORDER).toEqual(['works', 'creators', 'illustrations']);
  });

  it('totalResults sums all groups', () => {
    const res: SearchResponse = {
      works: [{ id: '1', type: 'works', title: 'W', thumbnail: null, route: '/w' }],
      creators: [
        { id: '2', type: 'creators', title: 'C', thumbnail: null, route: '/c' },
        { id: '3', type: 'creators', title: 'D', thumbnail: null, route: '/d' },
      ],
      illustrations: [],
    };
    expect(totalResults(res)).toBe(3);
  });

  it('totalResults returns 0 for all-empty response', () => {
    expect(totalResults({ works: [], creators: [], illustrations: [] })).toBe(0);
  });
});
