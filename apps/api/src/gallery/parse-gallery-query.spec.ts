import { parseGalleryQuery, parseCollectionsListQuery } from './parse-gallery-query';

describe('parseGalleryQuery', () => {
  it('defaults to no category (Tout), no q, empty genre, empty tags, tri=tendance, page=1 when nothing is provided', () => {
    expect(parseGalleryQuery({})).toEqual({ q: undefined, tags: [], genre: [], category: undefined, tri: 'tendance', page: 1, collection: undefined });
  });

  it('DR-12: passes an opaque collection id through (undefined when absent/empty)', () => {
    expect(parseGalleryQuery({ collection: 'w123' }).collection).toBe('w123');
    expect(parseGalleryQuery({ collection: '' }).collection).toBeUndefined();
    expect(parseGalleryQuery({}).collection).toBeUndefined();
  });

  it('F-22: normalizes a tag (strips #, lowercases, trims) and coerces a scalar into an array', () => {
    expect(parseGalleryQuery({ tags: '#Naruto ' }).tags).toEqual(['naruto']);
  });

  it('F-22: caps a tag at 30 characters (via the shared normalizer)', () => {
    expect(parseGalleryQuery({ tags: 'a'.repeat(40) }).tags).toEqual(['a'.repeat(30)]);
  });

  it('F-22: drops empty/bare-# tags', () => {
    expect(parseGalleryQuery({ tags: '' }).tags).toEqual([]);
    expect(parseGalleryQuery({ tags: '#' }).tags).toEqual([]);
    expect(parseGalleryQuery({ tags: ['naruto', '', '#'] }).tags).toEqual(['naruto']);
  });

  it('F-22: keeps multiple hashtags (AND-within) and dedupes', () => {
    expect(parseGalleryQuery({ tags: ['#Naruto', 'sasuke', 'naruto'] }).tags).toEqual(['naruto', 'sasuke']);
  });

  it('passes through q untouched', () => {
    expect(parseGalleryQuery({ q: 'onibi' }).q).toBe('onibi');
  });

  it('treats an empty q as undefined', () => {
    expect(parseGalleryQuery({ q: '' }).q).toBeUndefined();
  });

  it('L: caps q at 100 characters (DoS/expensive-ILIKE guard — public unauthenticated endpoint)', () => {
    expect(parseGalleryQuery({ q: 'a'.repeat(150) }).q).toBe('a'.repeat(100));
  });

  it('validates genre against the full F-20 vocabulary (Round 2 — round-trip, DR-2 precedent)', () => {
    expect(parseGalleryQuery({ genre: 'supernatural' }).genre).toEqual(['supernatural']);
  });

  it('coerces a scalar genre value into a single-item array', () => {
    expect(parseGalleryQuery({ genre: 'action' }).genre).toEqual(['action']);
  });

  it('keeps multiple valid genre ids (OR-within)', () => {
    expect(parseGalleryQuery({ genre: ['action', 'supernatural'] }).genre).toEqual(['action', 'supernatural']);
  });

  it('drops an unknown genre id', () => {
    expect(parseGalleryQuery({ genre: ['action', 'not-a-real-genre'] }).genre).toEqual(['action']);
  });

  it('keeps a known category', () => {
    expect(parseGalleryQuery({ category: 'personnages' }).category).toBe('personnages');
  });

  it('drops an unknown category (falls back to undefined = Tout)', () => {
    expect(parseGalleryQuery({ category: 'not-a-real-category' }).category).toBeUndefined();
  });

  it('defaults tri to "tendance"', () => {
    expect(parseGalleryQuery({}).tri).toBe('tendance');
  });

  it('drops an unknown tri, falling back to the default', () => {
    expect(parseGalleryQuery({ tri: 'nope' }).tri).toBe('tendance');
  });

  it('keeps a known tri', () => {
    expect(parseGalleryQuery({ tri: 'populaires' }).tri).toBe('populaires');
    expect(parseGalleryQuery({ tri: 'nouveautes' }).tri).toBe('nouveautes');
  });

  it.each([
    ['0', 1],
    ['-1', 1],
    ['abc', 1],
    [undefined, 1],
    ['3', 3],
  ])('clamps page=%s to %i', (input, expected) => {
    expect(parseGalleryQuery({ page: input }).page).toBe(expected);
  });
});

// BE-6 (J6): the DR-5 gallery query subset for the Galerie "Collections" facet — q/tags/genre/page
// only (no category/tri/collection keys).
describe('parseCollectionsListQuery', () => {
  it('defaults to no q, empty tags, empty genre, page=1', () => {
    expect(parseCollectionsListQuery({})).toEqual({ q: undefined, tags: [], genre: [], page: 1 });
  });

  it('caps q at 100 chars and treats empty as undefined', () => {
    expect(parseCollectionsListQuery({ q: 'a'.repeat(150) }).q).toBe('a'.repeat(100));
    expect(parseCollectionsListQuery({ q: '' }).q).toBeUndefined();
  });

  it('normalizes + dedupes tags (reusing the gallery normalizer)', () => {
    expect(parseCollectionsListQuery({ tags: ['#Encre', 'encre', '  Noir '] }).tags).toEqual(['encre', 'noir']);
    expect(parseCollectionsListQuery({ tags: ['', '#'] }).tags).toEqual([]);
  });

  it('validates genre against the full F-20 vocabulary, dropping unknowns', () => {
    expect(parseCollectionsListQuery({ genre: ['action', 'not-a-real-genre'] }).genre).toEqual(['action']);
  });

  it('clamps page to >= 1', () => {
    expect(parseCollectionsListQuery({ page: '0' }).page).toBe(1);
    expect(parseCollectionsListQuery({ page: '4' }).page).toBe(4);
  });

  it('does NOT carry category/tri/collection keys', () => {
    const q = parseCollectionsListQuery({ category: 'personnages', tri: 'populaires', collection: 'w1' }) as unknown as Record<string, unknown>;
    expect(q['category']).toBeUndefined();
    expect(q['tri']).toBeUndefined();
    expect(q['collection']).toBeUndefined();
  });
});
