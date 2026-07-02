'use client';

// F-13: CNIL-compliant cookie consent seam.
// ponytail: no non-essential scripts load today — this state is the gate seam;
// a future tracker checks consent.audience before loading.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export interface CookieConsent {
  version: 1;
  /** Mesure d'audience (analytics) */
  audience: boolean;
  /** Contenus tiers (embeds) */
  thirdParty: boolean;
  // essential is always-on implicitly, not stored
}

const STORAGE_KEY = 'ep_cookie_consent';

interface CookieConsentCtx {
  consent: CookieConsent | null;
  isSet: boolean;
  isOpen: boolean;
  save: (c: Omit<CookieConsent, 'version'>) => void;
  reopen: () => void;
}

export const CookieConsentContext = createContext<CookieConsentCtx>({
  consent: null,
  isSet: false,
  isOpen: false,
  save: () => {},
  reopen: () => {},
});

function readStored(): CookieConsent | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  // Start with isOpen=false (prevents SSR flash); corrected after mount
  const [isOpen, setIsOpen] = useState(false);
  const [isSet, setIsSet] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setConsent(stored);
    setIsSet(stored !== null);
    setIsOpen(stored === null); // show banner on first visit
  }, []);

  const save = useCallback((choices: Omit<CookieConsent, 'version'>) => {
    const c: CookieConsent = { version: 1, ...choices };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    setConsent(c);
    setIsSet(true);
    setIsOpen(false);
  }, []);

  const reopen = useCallback(() => setIsOpen(true), []);

  return (
    <CookieConsentContext.Provider value={{ consent, isSet, isOpen, save, reopen }}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export const useCookieConsent = () => useContext(CookieConsentContext);
