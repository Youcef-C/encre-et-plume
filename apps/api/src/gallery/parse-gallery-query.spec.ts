import { parseGalleryQuery } from './parse-gallery-query';

describe('parseGalleryQuery', () => {
  it('defaults to no category (Tout), no q, empty genre, no tag, tri=tendance, page=1 when nothing is provided', () => {
    expect(parseGalleryQuery({})).toEqual({ q: undefined, tag: undefined, genre: [], category: undefined, tri: 'tendance', page: 1 });
  });

  it('F-22: normalizes a tag (strips #, lowercases, trims)', () => {
    expect(parseGalleryQuery({ tag: '#Naruto ' }).tag).toBe('naruto');
  });

  it('F-22: caps a tag at 30 characters (via the shared normalizer)', () => {
    expect(parseGalleryQuery({ tag: 'a'.repeat(40) }).tag).toBe('a'.repeat(30));
  });

  it('F-22: treats an empty/bare-# tag as undefined', () => {
    expect(parseGalleryQuery({ tag: '' }).tag).toBeUndefined();
    expect(parseGalleryQuery({ tag: '#' }).tag).toBeUndefined();
  });

  it('F-22: drops an array-shaped tag (wrong shape -> undefined)', () => {
    expect(parseGalleryQuery({ tag: ['a', 'b'] }).tag).toBeUndefined();
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
