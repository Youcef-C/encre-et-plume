import { parseCatalogQuery } from './parse-catalog-query';

describe('parseCatalogQuery', () => {
  it('defaults to empty facets (public included), tri=populaires, page=1 when nothing is provided', () => {
    expect(parseCatalogQuery({})).toEqual({
      genre: [],
      format: [],
      public: [],
      langue: [],
      tri: 'populaires',
      page: 1,
    });
  });

  it('validates genre against the FULL vocabulary (not a fixed 6-value subset)', () => {
    expect(parseCatalogQuery({ genre: 'action' }).genre).toEqual(['action']);
  });

  it('drops an unknown genre id', () => {
    expect(parseCatalogQuery({ genre: ['seinen', 'not-a-real-genre'] }).genre).toEqual(['seinen']);
  });

  it('coerces a scalar facet value into a single-item array', () => {
    const result = parseCatalogQuery({ genre: 'seinen' });
    expect(result.genre).toEqual(['seinen']);
  });

  it('drops an unknown format/langue value', () => {
    const result = parseCatalogQuery({ format: ['Manga', 'Nope'], langue: ['Français', 'Nope'] });
    expect(result.format).toEqual(['Manga']);
    expect(result.langue).toEqual(['Français']);
  });

  it('drops "Traduit" from langue — removed from the vocabulary in round 2', () => {
    expect(parseCatalogQuery({ langue: ['Traduit'] }).langue).toEqual([]);
  });

  it('parses public as a multi-select array (round 2b): a scalar value coerces to a 1-item array', () => {
    expect(parseCatalogQuery({ public: 'mature' }).public).toEqual(['mature']);
    expect(parseCatalogQuery({ public: '18plus' }).public).toEqual(['18plus']);
  });

  it('parses public with both values selected -> both kept (OR-within)', () => {
    expect(parseCatalogQuery({ public: ['mature', '18plus'] }).public).toEqual(['mature', '18plus']);
  });

  it('drops "tous" from public — not part of the wire format, empty array is the default/all state', () => {
    expect(parseCatalogQuery({ public: 'tous' }).public).toEqual([]);
    expect(parseCatalogQuery({ public: ['tous', 'mature'] }).public).toEqual(['mature']);
  });

  it('drops an unknown public value (incl. an old audienceRating value)', () => {
    expect(parseCatalogQuery({ public: 'nope' }).public).toEqual([]);
    expect(parseCatalogQuery({ public: '18+' }).public).toEqual([]);
  });

  it('drops an unknown statut/longueur/tri, leaving them undefined/defaulted', () => {
    expect(parseCatalogQuery({ statut: 'nope' }).statut).toBeUndefined();
    expect(parseCatalogQuery({ longueur: 'nope' }).longueur).toBeUndefined();
    expect(parseCatalogQuery({ tri: 'nope' }).tri).toBe('populaires');
  });

  it('keeps a known statut/longueur/tri', () => {
    expect(parseCatalogQuery({ statut: 'complete' }).statut).toBe('complete');
    expect(parseCatalogQuery({ longueur: 'court' }).longueur).toBe('court');
    expect(parseCatalogQuery({ tri: 'nouveautes' }).tri).toBe('nouveautes');
  });

  it('passes through q untouched', () => {
    expect(parseCatalogQuery({ q: 'brume' }).q).toBe('brume');
  });

  it.each([
    ['0', 1],
    ['-1', 1],
    ['abc', 1],
    [undefined, 1],
    ['3', 3],
  ])('clamps page=%s to %i', (input, expected) => {
    expect(parseCatalogQuery({ page: input }).page).toBe(expected);
  });
});
