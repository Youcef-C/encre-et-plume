// DR-10 — mature (non-18+) content is a warning tag only, never blurred. Derived purely from the
// existing F-20 genre vocabulary (genre + hashtags) — no new trigger-warning taxonomy (ponytail).
import { describe, it, expect } from 'vitest';
import { isMatureContent } from '../lib/mature';

describe('isMatureContent (DR-10)', () => {
  it('is true when the genre itself is a mature vocabulary entry', () => {
    expect(isMatureContent('Yaoi', [])).toBe(true);
  });

  it('is true when a hashtag resolves to a mature vocabulary entry', () => {
    expect(isMatureContent('Seinen', ['Gore'])).toBe(true);
  });

  it('is false for an all-ages genre and hashtags', () => {
    expect(isMatureContent('Shōnen', ['fantasy', 'duo'])).toBe(false);
  });

  it('is false for unknown/free-text hashtags that do not resolve to any vocabulary entry', () => {
    expect(isMatureContent('Seinen', ['n\'importe-quoi'])).toBe(false);
  });
});
