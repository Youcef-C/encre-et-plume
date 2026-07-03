'use client';

// DR-3 — shared stub for every "personal action" button whose real feature isn't built yet
// (Ma liste, Soutenir, Proposer une collab, Partager, Signaler, Suivre, Publier mon avis).
// Anonymous -> redirect to sign-in (F-1). Authenticated -> deferred no-op with a transient
// "Bientôt disponible" affordance (AC-F14).
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountSummary } from '@encre-et-plume/shared';

export function usePersonalAction(account: AccountSummary | null) {
  const router = useRouter();
  const [notice, setNotice] = useState(false);

  const trigger = useCallback(() => {
    if (!account) {
      router.push('/connexion');
      return;
    }
    setNotice(true);
    setTimeout(() => setNotice(false), 2500);
  }, [account, router]);

  return { trigger, notice };
}
