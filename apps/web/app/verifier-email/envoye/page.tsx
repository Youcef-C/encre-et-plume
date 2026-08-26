import { Suspense } from 'react';
import EnvoyeClient from './EnvoyeClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Vérifiez votre e-mail — Encre & Plume', robots: { index: false, follow: false } };

export default function VerifierEmailEnvoyePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: 'calc(100dvh - 69px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink2)',
          }}
        >
          Chargement…
        </div>
      }
    >
      <EnvoyeClient />
    </Suspense>
  );
}
