import { describe, it, expect } from 'vitest';
import {
  ANNOUNCEMENT_LABEL,
  formatLikeCount,
  growthLabel,
  countdownLabel,
  releaseDateLabel,
} from '../lib/home';

describe('formatLikeCount', () => {
  it('formats 8100 as "8,1k"', () => {
    expect(formatLikeCount(8100)).toBe('8,1k');
  });
  it('formats 5700 as "5,7k"', () => {
    expect(formatLikeCount(5700)).toBe('5,7k');
  });
  it('formats 570 as "570" (no k suffix under 1000)', () => {
    expect(formatLikeCount(570)).toBe('570');
  });
  it('drops the trailing ",0" for round thousands', () => {
    expect(formatLikeCount(4000)).toBe('4k');
  });
});

describe('growthLabel', () => {
  it('formats a positive growth as "↑ 24%"', () => {
    expect(growthLabel(24)).toBe('↑ 24%');
  });
  it('formats a negative growth with a down arrow', () => {
    expect(growthLabel(-5)).toBe('↓ 5%');
  });
});

describe('countdownLabel', () => {
  it('formats "dans 1 j" for a release 20 hours away (ceil to 1 day)', () => {
    const now = new Date('2026-06-18T22:00:00.000Z');
    expect(countdownLabel('2026-06-19T18:00:00.000Z', now)).toBe('dans 1 j');
  });
  it('formats "dans 4 j"', () => {
    const now = new Date('2026-06-15T18:00:00.000Z');
    expect(countdownLabel('2026-06-19T18:00:00.000Z', now)).toBe('dans 4 j');
  });
});

describe('releaseDateLabel', () => {
  it('formats an ISO date as "VEN. 19 JUIN · 18:00" (UTC, uppercase, French)', () => {
    expect(releaseDateLabel('2026-06-19T18:00:00.000Z')).toBe('VEN. 19 JUIN · 18:00');
  });
});

describe('ANNOUNCEMENT_LABEL', () => {
  it('maps each announcement type to its verbatim French tag', () => {
    expect(ANNOUNCEMENT_LABEL.concours).toBe('Concours');
    expect(ANNOUNCEMENT_LABEL.a_chaud).toBe('À chaud');
    expect(ANNOUNCEMENT_LABEL.evenement).toBe('Événement');
  });
});
