'use client';

import { createContext, useContext, useEffect } from 'react';
import type { ThemePreference } from '@encre-et-plume/shared';

interface ThemeCtx {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  setTheme: () => {},
});

// ponytail: theme picker disabled for now — light mode forced everywhere.
// The full picker (light/dark/system, cross-device sync via account preferences)
// lives in git history (F-6 / F-19); restore it from there when re-enabling.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Pin light even if a stale ep_theme cookie or account preference says otherwise.
    document.documentElement.dataset.theme = 'light';
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light', setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
