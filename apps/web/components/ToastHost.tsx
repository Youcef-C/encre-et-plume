'use client';

// DR-14 — the single global toast host. Mounted once in `app/layout.tsx`; every surface that is
// stuck retrying registers on `lib/toastBus.ts` and they all merge into THIS one toast (never a
// stack). A skeleton that never resolves announces nothing, so this is also the only thing an
// assistive-tech user gets from a flaky load: `Toast` is `role="status"` + `aria-live="polite"` —
// polite on purpose, a retry in progress is not an alert.

import { useSyncExternalStore } from 'react';
import Toast from './Toast';
import { subscribe, getFailingCount, getServerCount, retryAll } from '../lib/toastBus';

export default function ToastHost() {
  // The third argument is the SSR snapshot — without it this throws during server render.
  const failing = useSyncExternalStore(subscribe, getFailingCount, getServerCount);
  if (failing === 0) return null;
  return (
    <Toast
      message="Connexion instable — nouvelle tentative…"
      action={{ label: 'Réessayer maintenant', onClick: retryAll }}
    />
  );
}
