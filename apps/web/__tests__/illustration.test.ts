// DR-6 FE-T1 — formatPublishedDate() for the illustration detail "Détails" sidebar.
import { describe, it, expect } from 'vitest';
import { formatPublishedDate } from '../lib/illustration';

describe('formatPublishedDate (DR-6)', () => {
  it('formats an ISO date in long French form', () => {
    expect(formatPublishedDate('2026-06-12T00:00:00.000Z')).toBe('12 juin 2026');
  });

  it('falls back to an em dash placeholder when null', () => {
    expect(formatPublishedDate(null)).toBe('—');
  });
});
