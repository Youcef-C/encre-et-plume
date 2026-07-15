'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AccountSummary } from '@encre-et-plume/shared';
import { getMe, logout as apiLogout } from './api';

interface SessionCtx {
  account: AccountSummary | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export const SessionContext = createContext<SessionCtx>({
  account: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAccount(await getMe());
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setAccount(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // CS-5 Fb-8 (author-identity drift) — the session cookie is authoritative for who signs API requests,
  // but a shared browser cookie jar (a second account logged in another tab) silently overwrites it while
  // this tab still displays the first account. Re-fetch /auth/me on focus / tab-visible and, when the
  // account id actually changed, swap context so the displayed identity matches the cookie that signs
  // writes (comments/corrections are then attributed to the acting account, never a stale one).
  useEffect(() => {
    const revalidate = async () => {
      try {
        const next = await getMe();
        setAccount((prev) => (prev?.id === next?.id ? prev : next));
      } catch {
        setAccount((prev) => (prev === null ? prev : null));
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <SessionContext.Provider value={{ account, loading, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
