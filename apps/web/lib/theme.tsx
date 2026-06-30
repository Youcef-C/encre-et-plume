'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ThemePreference } from '@encre-et-plume/shared';
import { THEME_PREFERENCES } from '@encre-et-plume/shared';
import { useSession } from './session';
import { updateMyPreferences } from './api';

interface ThemeCtx {
  theme: ThemePreference;
  setTheme: (t: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeCtx>({
  theme: 'system',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { account } = useSession();

  // Read SSR-set data-theme attribute; fall back to 'system' (handles server + jsdom)
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    if (typeof document === 'undefined') return 'system';
    const attr = document.documentElement.dataset.theme as ThemePreference;
    return THEME_PREFERENCES.includes(attr) ? attr : 'system';
  });

  // When account loads with an explicit preference, adopt it (cross-device sync)
  // ponytail: deps are account.id + account.preferences.theme; no loop because
  //           we only call setThemeState (not the setTheme callback), so updateMyPreferences is never triggered here.
  useEffect(() => {
    const accountTheme = account?.preferences?.theme;
    if (!accountTheme || !THEME_PREFERENCES.includes(accountTheme)) return;
    if (accountTheme === theme) return;
    document.documentElement.dataset.theme = accountTheme;
    document.cookie = `ep_theme=${accountTheme}; path=/; max-age=31536000; samesite=lax`;
    setThemeState(accountTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, account?.preferences?.theme]);

  const setTheme = useCallback(
    (t: ThemePreference) => {
      document.documentElement.dataset.theme = t;
      document.cookie = `ep_theme=${t}; path=/; max-age=31536000; samesite=lax`;
      setThemeState(t);
      if (account) {
        // fire-and-forget: cookie already covers this device; API call syncs other devices
        updateMyPreferences({ theme: t }).catch(() => {});
      }
    },
    [account],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
