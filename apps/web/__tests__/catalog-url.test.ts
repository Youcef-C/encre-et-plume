import { describe, it, expect } from 'vitest';
import type { CatalogQuery } from '@encre-et-plume/shared';
import {
  EMPTY_FILTERS,
  parseFilters,
  filtersToQuery,
  activeFilterChips,
  STATUT_LABELS,
  LONGUEUR_LABELS,
  TRI_LABELS,
  PUBLIC_LABELS,
} from '../lib/catalog';

describe('parseFilters / filtersToQuery (DR-2 FE-2, round 2)', () => {
  it('parses an empty query into EMPTY_FILTERS', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(EMPTY_FILTERS);
  });

  it('parses multi-value facets as arrays', () => {
    const filters = parseFilters(new URLSearchParams('genre=seinen&genre=shonen&format=Manga'));
    expect(filters.genre).toEqual(['seinen', 'shonen']);
    expect(filters.format).toEqual(['Manga']);
  });

  it('accepts any full-vocabulary genre id, not just the round-1 six', () => {
    const filters = parseFilters(new URLSearchParams('genre=adventure'));
    expect(filters.genre).toEqual(['adventure']);
  });

  it('drops unknown facet values', () => {
    const filters = parseFilters(new URLSearchParams('genre=not-a-genre&genre=seinen&statut=nope'));
    expect(filters.genre).toEqual(['seinen']);
    expect(filters.statut).toBeUndefined();
  });

  it('parses public as a multi-select array, dropping "tous"/unknown (round 2b)', () => {
    expect(parseFilters(new URLSearchParams('')).public).toEqual([]);
    expect(parseFilters(new URLSearchParams('public=tous')).public).toEqual([]);
    expect(parseFilters(new URLSearchParams('public=n-importe-quoi')).public).toEqual([]);
    expect(parseFilters(new URLSearchParams('public=mature')).public).toEqual(['mature']);
    expect(parseFilters(new URLSearchParams('public=mature&public=18plus')).public).toEqual(['mature', '18plus']);
  });

  it('drops the removed theme param entirely (no field on CatalogQuery)', () => {
    const filters = parseFilters(new URLSearchParams('theme=Action'));
    expect(filters).not.toHaveProperty('theme');
  });

  it('drops the removed "Traduit" language value', () => {
    expect(parseFilters(new URLSearchParams('langue=Traduit')).langue).toEqual([]);
  });

  it('defaults tri to populaires when missing or unknown', () => {
    expect(parseFilters(new URLSearchParams('')).tri).toBe('populaires');
    expect(parseFilters(new URLSearchParams('tri=n-importe-quoi')).tri).toBe('populaires');
    expect(parseFilters(new URLSearchParams('tri=nouveautes')).tri).toBe('nouveautes');
  });

  it('clamps page to >= 1', () => {
    expect(parseFilters(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseFilters(new URLSearchParams('page=-3')).page).toBe(1);
    expect(parseFilters(new URLSearchParams('page=abc')).page).toBe(1);
    expect(parseFilters(new URLSearchParams('page=3')).page).toBe(3);
  });

  it('round-trips parse -> serialize -> parse', () => {
    const filters = parseFilters(
      new URLSearchParams('q=Ronin&genre=seinen&genre=adventure&statut=complete&format=Manga&format=Roman&public=mature&public=18plus&longueur=court&langue=Fran%C3%A7ais&tri=mieux-notees&page=2'),
    );
    const roundTripped = parseFilters(filtersToQuery(filters));
    expect(roundTripped).toEqual(filters);
  });

  it('serializing EMPTY_FILTERS yields no query keys', () => {
    expect([...filtersToQuery(EMPTY_FILTERS).keys()]).toEqual([]);
  });

  it('serializing omits the default tri, page=1 and empty public', () => {
    const q = filtersToQuery({ ...EMPTY_FILTERS, genre: ['seinen'] });
    expect(q.has('tri')).toBe(false);
    expect(q.has('page')).toBe(false);
    expect(q.has('public')).toBe(false);
    expect(q.getAll('genre')).toEqual(['seinen']);
  });

  it('serializes multi-select public values (round 2b)', () => {
    const q = filtersToQuery({ ...EMPTY_FILTERS, public: ['mature', '18plus'] });
    expect(q.getAll('public')).toEqual(['mature', '18plus']);
  });
});

describe('activeFilterChips', () => {
  it('yields one entry per active facet value with the display label', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['shonen'], format: ['Manga'] };
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(['Shōnen', 'Manga']);
  });

  it('includes statut and longueur as single-value chips', () => {
    const chips = activeFilterChips({ ...EMPTY_FILTERS, statut: 'complete', longueur: 'court' });
    expect(chips.map((c) => c.label)).toEqual([STATUT_LABELS.complete, LONGUEUR_LABELS.court]);
  });

  it('includes one removable PUBLIC chip per selected value, none when empty (round 2b)', () => {
    expect(activeFilterChips({ ...EMPTY_FILTERS, public: ['mature'] }).map((c) => c.label)).toEqual([PUBLIC_LABELS.mature]);
    expect(activeFilterChips({ ...EMPTY_FILTERS, public: ['mature', '18plus'] }).map((c) => c.label)).toEqual([
      PUBLIC_LABELS.mature,
      PUBLIC_LABELS['18plus'],
    ]);
    expect(activeFilterChips({ ...EMPTY_FILTERS, public: [] })).toEqual([]);
  });

  it('removing a PUBLIC chip clears just that value (round 2b)', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, public: ['mature', '18plus'] };
    const chips = activeFilterChips(filters);
    const matureChip = chips.find((c) => c.label === PUBLIC_LABELS.mature)!;
    expect(matureChip.remove(filters).public).toEqual(['18plus']);
  });

  it('removing a chip clears just that facet value', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['seinen', 'shonen'] };
    const chips = activeFilterChips(filters);
    const shonenChip = chips.find((c) => c.label === 'Shōnen')!;
    expect(shonenChip.remove(filters).genre).toEqual(['seinen']);
  });

  it('removing the statut chip unsets statut', () => {
    const filters = { ...EMPTY_FILTERS, statut: 'complete' as const };
    const chips = activeFilterChips(filters);
    expect(chips[0]!.remove(filters).statut).toBeUndefined();
  });

  it('returns no chips for EMPTY_FILTERS', () => {
    expect(activeFilterChips(EMPTY_FILTERS)).toEqual([]);
  });

  it('exposes a descriptive aria label per chip', () => {
    const chips = activeFilterChips({ ...EMPTY_FILTERS, genre: ['shonen'] });
    expect(chips[0]!.ariaLabel).toBe('Retirer le filtre Shōnen');
  });
});

describe('French label maps', () => {
  it('TRI_LABELS covers all three sort options', () => {
    expect(TRI_LABELS.populaires).toBe('Populaires');
    expect(TRI_LABELS.nouveautes).toBe('Nouveautés');
    expect(TRI_LABELS['mieux-notees']).toBe('Mieux notées');
  });

  it('PUBLIC_LABELS covers the two multi-select values (round 2b — "tous" is not a wire value)', () => {
    expect(PUBLIC_LABELS.mature).toBe('Mature');
    expect(PUBLIC_LABELS['18plus']).toBe('+18');
  });
});
