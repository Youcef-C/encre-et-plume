'use client';

// DR-9 FE1 — the DRY optimistic-toggle hook every ♥/★ surface (WorkHero, HeroCarousel,
// ReactionsAside, IllustrationViewer, MaListeClient) reuses. Anonymous -> redirect to sign-in
// (same idiom as usePersonalAction); authenticated -> flip active/count immediately, call the
// real endpoint, reconcile with the server response, revert + flag `error` on rejection. An
// in-flight lock (`pending`) coalesces rapid taps instead of queueing them.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountSummary, ReactionKind, ReactionTargetType, ReactionToggleRequest, ReactionToggleResponse } from '@encre-et-plume/shared';
import * as api from './api';

const TOGGLERS: Record<ReactionKind, { on: (b: ReactionToggleRequest) => Promise<ReactionToggleResponse>; off: (b: ReactionToggleRequest) => Promise<ReactionToggleResponse> }> = {
  like: { on: api.likeReaction, off: api.unlikeReaction },
  save: { on: api.saveReaction, off: api.unsaveReaction },
};

export function useReaction(opts: {
  targetType: ReactionTargetType;
  targetId: string;
  kind: ReactionKind;
  account: AccountSummary | null;
  initialActive: boolean;
  initialCount: number;
}) {
  const { targetType, targetId, kind, account, initialActive, initialCount } = opts;
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  // Hydrated state can arrive after mount (an async GET /reactions/state) — adopt it as long as
  // no optimistic toggle is currently in flight, so a slow hydration never clobbers a fresh tap.
  useEffect(() => {
    if (!inFlight.current) {
      setActive(initialActive);
      setCount(initialCount);
    }
  }, [initialActive, initialCount]);

  const toggle = useCallback(() => {
    if (!account) {
      router.push('/connexion');
      return;
    }
    if (inFlight.current) return;

    const prevActive = active;
    const prevCount = count;
    const nextActive = !prevActive;

    inFlight.current = true;
    setPending(true);
    setError(false);
    setActive(nextActive);
    setCount(prevCount + (nextActive ? 1 : -1));

    const call = nextActive ? TOGGLERS[kind].on : TOGGLERS[kind].off;
    call({ targetType, targetId })
      .then((res) => {
        setActive(res.active);
        setCount(res.count);
      })
      .catch(() => {
        setActive(prevActive);
        setCount(prevCount);
        setError(true);
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  }, [account, active, count, kind, targetType, targetId, router]);

  return { active, count, pending, error, toggle };
}
