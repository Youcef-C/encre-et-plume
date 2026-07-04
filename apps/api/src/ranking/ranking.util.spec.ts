import { rankingScore, rankingWhere, toRankingRow, RANKING_LIMIT, RANKING_ORDER_BY } from './ranking.util';

describe('ranking.util', () => {
  describe('rankingScore', () => {
    it('returns likeCount', () => {
      expect(rankingScore({ likeCount: 8100 })).toBe(8100);
    });
  });

  describe('rankingWhere', () => {
    it('returns a genre-equality where clause when genre is given', () => {
      expect(rankingWhere('Seinen')).toEqual({ genre: 'Seinen' });
    });

    it('returns an empty where clause for an empty string genre', () => {
      expect(rankingWhere('')).toEqual({});
    });

    it('returns an empty where clause for undefined genre', () => {
      expect(rankingWhere(undefined)).toEqual({});
    });
  });

  describe('toRankingRow', () => {
    it('maps a work to a 1-based ranked row, mapping coverImage to cover', () => {
      const work = { id: 'w1', slug: 'neon-sutra', title: 'Néon Sutra', coverImage: null, meta: 'Léa B. × Hugo D. · 24 ch.' };

      expect(toRankingRow(work, 0)).toEqual({ id: 'w1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.' });
      expect(toRankingRow(work, 3)).toMatchObject({ rank: 4 });
    });

    it('passes through a non-null cover URL', () => {
      const work = { id: 'w2', slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: 'https://cdn/lames.jpg', meta: 'meta' };

      expect(toRankingRow(work, 0).cover).toBe('https://cdn/lames.jpg');
    });
  });

  it('exports the bounded top-N limit and the shared deterministic order', () => {
    expect(RANKING_LIMIT).toBe(50);
    expect(RANKING_ORDER_BY).toEqual([{ likeCount: 'desc' }, { id: 'asc' }]);
  });
});
