import { BadRequestException } from '@nestjs/common';
import { parseMyProjectsQuery } from './parse-my-projects-query';

describe('parseMyProjectsQuery', () => {
  it('defaults to the legacy picker scope with status/type "tous" and page 1', () => {
    expect(parseMyProjectsQuery({})).toEqual({ scope: 'projects', q: undefined, status: 'tous', type: 'tous', page: 1 });
  });

  it('accepts each known type filter', () => {
    for (const t of ['tous', 'manga', 'histoire', 'illustrations', 'collections']) {
      expect(parseMyProjectsQuery({ type: t }).type).toBe(t);
    }
  });

  it('rejects an unknown type (incl. the retired singular "illustration") with 400', () => {
    expect(() => parseMyProjectsQuery({ type: 'roman' })).toThrow(BadRequestException);
    expect(() => parseMyProjectsQuery({ type: 'illustration' })).toThrow(BadRequestException);
  });

  it('accepts scope=all', () => {
    expect(parseMyProjectsQuery({ scope: 'all' }).scope).toBe('all');
  });

  it('coerces an unknown scope back to the legacy default', () => {
    expect(parseMyProjectsQuery({ scope: 'nope' }).scope).toBe('projects');
  });

  it('trims q and maps an empty string to undefined', () => {
    expect(parseMyProjectsQuery({ q: '  brume  ' }).q).toBe('brume');
    expect(parseMyProjectsQuery({ q: '   ' }).q).toBeUndefined();
  });

  it('caps q at PROJECTS_SEARCH_MAX (100) chars — slices, never 400s', () => {
    const long = 'a'.repeat(250);
    expect(parseMyProjectsQuery({ q: long }).q).toHaveLength(100);
  });

  it('accepts each known status filter', () => {
    for (const s of ['tous', 'en-cours', 'en-pause', 'publies']) {
      expect(parseMyProjectsQuery({ status: s }).status).toBe(s);
    }
  });

  it('rejects an unknown status with 400', () => {
    expect(() => parseMyProjectsQuery({ status: 'archived' })).toThrow(BadRequestException);
  });

  it('clamps page to >= 1 and parses ints', () => {
    expect(parseMyProjectsQuery({ page: '3' }).page).toBe(3);
    expect(parseMyProjectsQuery({ page: '0' }).page).toBe(1);
    expect(parseMyProjectsQuery({ page: '-5' }).page).toBe(1);
    expect(parseMyProjectsQuery({ page: 'abc' }).page).toBe(1);
  });
});
