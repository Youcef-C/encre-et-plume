// DR-10 FE-2 — age-gate clearance store. No server-side session concept for this; purely a
// client affordance layered over the backend's real enforcement (AgeGateService 403s).
//
//   visitor (account === null)      -> sessionStorage flag (self-declaration, once per tab session)
//   logged-in adult (isAdult=true)  -> in-memory flag (this tab/session) + localStorage when the
//                                      viewer checks "Ne plus me demander" (persists across sessions)
//   logged-in minor / no birthdate  -> never cleared (isAdult !== true)
'use client';

import { useEffect, useState } from 'react';
import type { AccountSummary } from '@encre-et-plume/shared';

const SESSION_KEY = 'ep_age_cleared';
const EVENT = 'ep-age-cleared-change';

function localKey(accountId: string): string {
  return `ep_age_cleared:${accountId}`;
}

// ponytail: per-tab "shown once" memory for adults who don't check "remember" — a Set (not a
// single boolean) so clearing one adult account never leaks clearance to another.
let sessionClearedAccountIds = new Set<string>();

/** Test-only reset of the in-memory (non-persisted) clearance state. */
export function resetAgeGateForTests(): void {
  sessionClearedAccountIds = new Set();
}

/** True when the current viewer has already cleared the 18+ interstitial. */
export function isAgeCleared(account: AccountSummary | null): boolean {
  if (account) {
    if (account.isAdult !== true) return false; // minor or no birthdate on file -> never cleared
    if (sessionClearedAccountIds.has(account.id)) return true;
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(localKey(account.id)) === '1';
  }
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(SESSION_KEY) === '1';
}

/**
 * Mark the viewer as age-cleared. `remember` (default true) only applies to logged-in adults —
 * checking "Ne plus me demander" persists the clearance to localStorage; leaving it unchecked
 * still clears them for the rest of this tab session (in-memory only).
 */
export function clearAge(account: AccountSummary | null, remember = true): void {
  if (account) {
    if (account.isAdult !== true) return; // minors can never be cleared
    sessionClearedAccountIds.add(account.id);
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem(localKey(account.id), '1');
    }
  } else if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** React hook: re-renders when the clearance state changes (storage event or same-tab clearAge()). */
export function useAgeCleared(account: AccountSummary | null): boolean {
  const [cleared, setCleared] = useState(() => isAgeCleared(account));

  useEffect(() => {
    function update() {
      setCleared(isAgeCleared(account));
    }
    update();
    window.addEventListener('storage', update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener(EVENT, update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, account?.isAdult]);

  return cleared;
}
