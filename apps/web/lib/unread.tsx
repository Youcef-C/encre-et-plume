'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UnreadCounts } from '@encre-et-plume/shared';
import { getUnreadCounts } from './api';
import { useSession } from './session';

// ─── Legacy number context — kept for backward compat (Header tests, badge on avatar) ──
// useUnreadCount() → counts.total (same type as the F-4 stub)
export const UnreadContext = createContext<number>(0);
export const useUnreadCount = () => useContext(UnreadContext);

// ─── Full counts context (F-5) ────────────────────────────────────────────────
const DEFAULT_COUNTS: UnreadCounts = { total: 0, messages: 0, demandes: 0, signalements: 0 };

interface UnreadCountsCtx {
  counts: UnreadCounts;
  refresh: () => void;
}

export const UnreadCountsContext = createContext<UnreadCountsCtx>({
  counts: DEFAULT_COUNTS,
  refresh: () => {},
});

export const useUnreadCounts = () => useContext(UnreadCountsContext);

// ─── Provider ─────────────────────────────────────────────────────────────────
// Counts refresh on mount, window focus, explicitly after mark-read mutations, AND live via the
// MC-9 socket gateway: MessagingProvider calls refresh() on `message:new` and `unread:changed`
// (BE-RT1), so all header badges update in realtime with no polling timer.
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { account } = useSession();
  const [counts, setCounts] = useState<UnreadCounts>(DEFAULT_COUNTS);

  const refresh = useCallback(() => {
    if (!account) return;
    getUnreadCounts().then(setCounts).catch(() => {
      // Silent: network error leaves previous counts in place
    });
  }, [account]);

  // Fetch on mount (or when session changes)
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refetch on window focus (tab switch back)
  useEffect(() => {
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  return (
    <UnreadCountsContext.Provider value={{ counts, refresh }}>
      <UnreadContext.Provider value={counts.total}>
        {children}
      </UnreadContext.Provider>
    </UnreadCountsContext.Provider>
  );
}
