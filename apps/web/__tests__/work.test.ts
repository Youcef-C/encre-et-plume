import { describe, it, expect } from 'vitest';
import { ratingLabel, chapterDateLabel, releaseYearLabel, formatEuros } from '../lib/work';

describe('lib/work formatters (DR-3 FE-8)', () => {
  it('ratingLabel formats French decimal, drops trailing ,0', () => {
    expect(ratingLabel(4.5)).toBe('4,5');
    expect(ratingLabel(4)).toBe('4');
    expect(ratingLabel(0)).toBe('0');
    expect(ratingLabel(4.66)).toBe('4,7');
  });

  it('chapterDateLabel renders a French long date (UTC)', () => {
    expect(chapterDateLabel('2024-03-14T00:00:00.000Z')).toBe('14 mars 2024');
    expect(chapterDateLabel('2024-09-12T00:00:00.000Z')).toBe('12 septembre 2024');
  });

  it('releaseYearLabel extracts the year, empty string when null', () => {
    expect(releaseYearLabel('2024-03-14T00:00:00.000Z')).toBe('2024');
    expect(releaseYearLabel(null)).toBe('');
  });

  it('formatEuros converts cents to whole euros', () => {
    expect(formatEuros(45000)).toBe('450');
    expect(formatEuros(12000)).toBe('120');
  });
});
