import {
  rankingScore,
  rankingWhere,
  toRankingRow,
  toRankingEntryFromWork,
  toRankingEntryFromIllustration,
  toRankingEntryFromProfile,
  RANKING_LIMIT,
  RANKING_ORDER_BY,
} from './ranking.util';

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
      const work = { id: 'w1', slug: 'neon-sutra', title: 'Néon Sutra', coverImage: null, meta: 'Léa B. × Hugo D. · 24 ch.', audienceRating: 'Tous publics' };

      expect(toRankingRow(work, 0)).toEqual({ id: 'w1', slug: 'neon-sutra', rank: 1, title: 'Néon Sutra', cover: null, meta: 'Léa B. × Hugo D. · 24 ch.', is18plus: false });
      expect(toRankingRow(work, 3)).toMatchObject({ rank: 4 });
    });

    it('passes through a non-null cover URL', () => {
      const work = { id: 'w2', slug: 'lames-de-brume', title: 'Lames de Brume', coverImage: 'https://cdn/lames.jpg', meta: 'meta', audienceRating: 'Tous publics' };

      expect(toRankingRow(work, 0).cover).toBe('https://cdn/lames.jpg');
    });

    it('DR-10: is18plus true when audienceRating is 18+', () => {
      const work = { id: 'w3', slug: 'nuit-rouge', title: 'Nuit Rouge', coverImage: null, meta: 'meta', audienceRating: '18+' };

      expect(toRankingRow(work, 0).is18plus).toBe(true);
    });
  });

  it('exports the bounded top-N limit and the shared deterministic order', () => {
    expect(RANKING_LIMIT).toBe(50);
    expect(RANKING_ORDER_BY).toEqual([{ likeCount: 'desc' }, { id: 'asc' }]);
  });

  describe('toRankingEntryFromWork (DR-7 category tabs: mangas/romans)', () => {
    it('maps a work to a RankingEntry with an /oeuvre href, reusing toRankingRow', () => {
      const work = { id: 'w1', slug: 'neon-sutra', title: 'Néon Sutra', coverImage: null, meta: 'Léa B. × Hugo D. · 24 ch.', audienceRating: 'Tous publics' };

      expect(toRankingEntryFromWork(work, 0)).toEqual({
        rank: 1,
        id: 'w1',
        title: 'Néon Sutra',
        meta: 'Léa B. × Hugo D. · 24 ch.',
        cover: null,
        href: '/oeuvre/neon-sutra',
        is18plus: false,
      });
    });

    it('DR-10: is18plus true when audienceRating is 18+', () => {
      const work = { id: 'w2', slug: 'le-dernier-ronin', title: 'Le Dernier Ronin', coverImage: null, meta: 'meta', audienceRating: '18+' };

      expect(toRankingEntryFromWork(work, 0).is18plus).toBe(true);
    });
  });

  describe('toRankingEntryFromIllustration (DR-7 category tab: illustrations)', () => {
    it('maps an illustration to a RankingEntry with an /illustration href and composed meta', () => {
      const row = { id: 'illus-1', title: 'Pluie de Néons', artistName: 'Yuki Moreau', category: 'couvertures', genres: ['Shōnen'], likeCount: 12401, image: 'https://cdn/illus.jpg' };

      expect(toRankingEntryFromIllustration(row, 2)).toEqual({
        rank: 3,
        id: 'illus-1',
        title: 'Pluie de Néons',
        meta: 'Yuki Moreau · Couvertures · 12401 ♥',
        cover: 'https://cdn/illus.jpg',
        href: '/illustration/illus-1',
        is18plus: false,
      });
    });

    it('DR-10: is18plus true when genres includes a plus18 vocabulary entry', () => {
      const row = { id: 'illus-2', title: 'Nuit close', artistName: 'Camille D.', category: 'personnages', genres: ['Érotique'], likeCount: 640, image: null };

      expect(toRankingEntryFromIllustration(row, 0).is18plus).toBe(true);
    });
  });

  describe('toRankingEntryFromProfile (DR-7 category tab: createurs)', () => {
    it('maps a profile to a RankingEntry with a profile href, role-label meta, and is18plus always false', () => {
      const row = { creatorRoles: ['dessinateur'], account: { id: 'acc-1', displayName: 'Yuki Moreau', profileSlug: 'dr1-yuki-moreau', avatar: 'https://cdn/avatar.jpg' } };

      expect(toRankingEntryFromProfile(row, 0)).toEqual({
        rank: 1,
        id: 'acc-1',
        title: 'Yuki Moreau',
        meta: 'Dessinateur·rice',
        cover: 'https://cdn/avatar.jpg',
        href: '/dr1-yuki-moreau',
        is18plus: false,
      });
    });

    it('joins multiple creator roles with " · "', () => {
      const row = { creatorRoles: ['scenariste', 'dessinateur'], account: { id: 'acc-2', displayName: 'Camille Roux', profileSlug: 'dr1-camille-roux', avatar: null } };

      expect(toRankingEntryFromProfile(row, 0).meta).toBe('Scénariste · Dessinateur·rice');
    });
  });
});
