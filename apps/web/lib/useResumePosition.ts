'use client';

// DR-11 F-a — fetches the resume position for one work. null when anonymous, no history
// (404), or any error — the caller falls back to the unchanged "Lire" CTA silently.
import { useEffect, useState } from 'react';
import type { AccountSummary, ReadingHistoryEntry } from '@encre-et-plume/shared';
import { getReadingHistoryForWork } from './api';

export function useResumePosition(slug: string, account: AccountSummary | null): ReadingHistoryEntry | null {
  const [entry, setEntry] = useState<ReadingHistoryEntry | null>(null);

  useEffect(() => {
    if (!account) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    getReadingHistoryForWork(slug)
      .then((data) => {
        if (!cancelled) setEntry(data);
      })
      .catch(() => {
        if (!cancelled) setEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, account]);

  return entry;
}
