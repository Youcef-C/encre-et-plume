// DR-10 FE-2 — age-gate clearance store: session (visitor) / localStorage (adult "remember")
// / in-memory (adult, current tab only) clearance tracking.
import { describe, it, expect, beforeEach } from 'vitest';
import type { AccountSummary } from '@encre-et-plume/shared';
import { isAgeCleared, clearAge, resetAgeGateForTests } from '../lib/ageGate';

const adult: AccountSummary = {
  id: 'a1',
  displayName: 'Yuki',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'yuki',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const minor: AccountSummary = { ...adult, id: 'm1', isAdult: false };
const noBirthdate: AccountSummary = { ...adult, id: 'n1', isAdult: null };

describe('ageGate (DR-10 FE-2)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetAgeGateForTests();
  });

  it('visitor (account null) is not cleared by default', () => {
    expect(isAgeCleared(null)).toBe(false);
  });

  it('visitor self-declaration sets a session flag that clears them', () => {
    clearAge(null);
    expect(isAgeCleared(null)).toBe(true);
  });

  it('a minor is never cleared, even after clearAge is called', () => {
    clearAge(minor);
    expect(isAgeCleared(minor)).toBe(false);
  });

  it('an account with no birthdate on file is never cleared', () => {
    expect(isAgeCleared(noBirthdate)).toBe(false);
  });

  it('a logged-in adult is not cleared until they confirm', () => {
    expect(isAgeCleared(adult)).toBe(false);
  });

  it('a logged-in adult confirming without "remember" is cleared for this tab session only', () => {
    clearAge(adult, false);
    expect(isAgeCleared(adult)).toBe(true);
    // Not persisted to localStorage
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBeNull();
  });

  it('a logged-in adult confirming WITH "remember" persists across the in-memory reset (localStorage)', () => {
    clearAge(adult, true);
    expect(localStorage.getItem(`ep_age_cleared:${adult.id}`)).toBe('1');
    resetAgeGateForTests(); // simulates a fresh tab/reload — in-memory flag drops
    expect(isAgeCleared(adult)).toBe(true); // still cleared via localStorage
  });

  it('clearing one adult account does not clear a different adult account', () => {
    clearAge(adult, true);
    const otherAdult: AccountSummary = { ...adult, id: 'a2' };
    expect(isAgeCleared(otherAdult)).toBe(false);
  });
});
