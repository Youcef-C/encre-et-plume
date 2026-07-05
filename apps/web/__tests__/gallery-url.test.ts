// DR-5 FE-1 — gallery "Galerie" URL <-> filter state (single-select category, mirrors lib/catalog.ts).
import { describe, it, expect } from 'vitest';
import {
  EMPTY_GALLERY_FILTERS,
  CATEGORY_CHIPS,
  TRI_LABELS,
  parseGalleryFilters,
  filtersToGalleryQuery,
} from '../lib/gallery';

describe('parseGalleryFilters / filtersToGalleryQuery (DR-5 FE-1)', () => {
  it('parses an empty query into EMPTY_GALLERY_FILTERS', () => {
    expect(parseGalleryFilters(new URLSearchParams(''))).toEqual(EMPTY_GALLERY_FILTERS);
  });

  it('keeps a known category', () => {
    expect(parseGalleryFilters(new URLSearchParams('category=fanart')).category).toBe('fanart');
  });

  it('drops an unknown category to undefined ("Tout")', () => {
    expect(parseGalleryFilters(new URLSearchParams('category=pas-un-genre')).category).toBeUndefined();
  });

  it('defaults tri to tendance when missing or unknown', () => {
    expect(parseGalleryFilters(new URLSearchParams('')).tri).toBe('tendance');
    expect(parseGalleryFilters(new URLSearchParams('tri=n-importe-quoi')).tri).toBe('tendance');
    expect(parseGalleryFilters(new URLSearchParams('tri=populaires')).tri).toBe('populaires');
  });

  it('clamps page to >= 1', () => {
    expect(parseGalleryFilters(new URLSearchParams('page=0')).page).toBe(1);
    expect(parseGalleryFilters(new URLSearchParams('page=abc')).page).toBe(1);
    expect(parseGalleryFilters(new URLSearchParams('page=3')).page).toBe(3);
  });

  it('round-trips parse -> serialize -> parse', () => {
    const filters = parseGalleryFilters(new URLSearchParams('category=decors&tri=nouveautes&page=2'));
    expect(parseGalleryFilters(filtersToGalleryQuery(filters))).toEqual(filters);
  });

  it('serializing EMPTY_GALLERY_FILTERS yields no query keys (defaults omitted)', () => {
    expect([...filtersToGalleryQuery(EMPTY_GALLERY_FILTERS).keys()]).toEqual([]);
  });

  it('omits category=tout — "Tout" is the absence of the param', () => {
    const q = filtersToGalleryQuery({ ...EMPTY_GALLERY_FILTERS, category: undefined });
    expect(q.has('category')).toBe(false);
  });
});

// Round 2 (backend-notes.md "Round 2" — `q` text search + `genre[]` F-20 facet added to
// GET /illustrations). Mirrors DR-2's catalog `q`/`genre` handling exactly.
describe('parseGalleryFilters / filtersToGalleryQuery — q + genre (Round 2)', () => {
  it('parses q, trimmed, empty string -> undefined', () => {
    expect(parseGalleryFilters(new URLSearchParams('q=onibi')).q).toBe('onibi');
    expect(parseGalleryFilters(new URLSearchParams('q=')).q).toBeUndefined();
    expect(parseGalleryFilters(new URLSearchParams('q=%20%20')).q).toBeUndefined();
  });

  it('parses genre as a multi-value array of known F-20 ids', () => {
    const filters = parseGalleryFilters(new URLSearchParams('genre=seinen&genre=yokai'));
    expect(filters.genre).toEqual(['seinen', 'yokai']);
  });

  it('drops unknown genre ids, keeping only the known ones', () => {
    const filters = parseGalleryFilters(new URLSearchParams('genre=not-a-genre&genre=seinen'));
    expect(filters.genre).toEqual(['seinen']);
  });

  it('defaults genre to [] when absent', () => {
    expect(parseGalleryFilters(new URLSearchParams('')).genre).toEqual([]);
  });

  it('serializes q and repeats genre params, round-trips', () => {
    const filters = parseGalleryFilters(new URLSearchParams('q=onibi&genre=seinen&genre=yokai&category=fanart'));
    const query = filtersToGalleryQuery(filters);
    expect(query.get('q')).toBe('onibi');
    expect(query.getAll('genre')).toEqual(['seinen', 'yokai']);
    expect(parseGalleryFilters(query)).toEqual(filters);
  });

  it('omits q and genre from the query string when empty (defaults)', () => {
    const q = filtersToGalleryQuery(EMPTY_GALLERY_FILTERS);
    expect(q.has('q')).toBe(false);
    expect(q.has('genre')).toBe(false);
  });
});

// F-22 — freetext hashtag `tag` filter (exact match on Illustration.hashtags). Normalized through
// the shared normalizeHashtag so the chip label and the query param always agree with the BE filter.
describe('parseGalleryFilters / filtersToGalleryQuery — tag (F-22)', () => {
  it('parses tag, normalized (lowercased, # stripped, diacritics kept)', () => {
    expect(parseGalleryFilters(new URLSearchParams('tag=%23Néon')).tag).toBe('néon');
    expect(parseGalleryFilters(new URLSearchParams('tag=Naruto')).tag).toBe('naruto');
  });

  it('drops an empty / hash-only tag to undefined', () => {
    expect(parseGalleryFilters(new URLSearchParams('tag=')).tag).toBeUndefined();
    expect(parseGalleryFilters(new URLSearchParams('tag=%23')).tag).toBeUndefined();
    expect(parseGalleryFilters(new URLSearchParams('')).tag).toBeUndefined();
  });

  it('serializes tag and round-trips', () => {
    const filters = parseGalleryFilters(new URLSearchParams('tag=yokai&genre=seinen&q=onibi'));
    const query = filtersToGalleryQuery(filters);
    expect(query.get('tag')).toBe('yokai');
    expect(parseGalleryFilters(query)).toEqual(filters);
  });

  it('omits tag from the query string when absent (default)', () => {
    expect(filtersToGalleryQuery(EMPTY_GALLERY_FILTERS).has('tag')).toBe(false);
  });
});

describe('CATEGORY_CHIPS', () => {
  it('leads with "Tout" (undefined key) then the 5 canonical categories, verbatim French labels', () => {
    expect(CATEGORY_CHIPS.map((c) => c.label)).toEqual([
      'Tout',
      'Personnages',
      'Couvertures',
      'Décors',
      'Fan-art',
      'Process',
    ]);
    expect(CATEGORY_CHIPS[0]!.key).toBeUndefined();
  });
});

describe('TRI_LABELS', () => {
  it('covers the three sort options, verbatim French labels', () => {
    expect(TRI_LABELS.tendance).toBe('Tendance');
    expect(TRI_LABELS.nouveautes).toBe('Nouveautés');
    expect(TRI_LABELS.populaires).toBe('Populaires');
  });
});
