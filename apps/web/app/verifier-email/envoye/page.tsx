import { Suspense } from 'react';
import EnvoyeClient from './EnvoyeClient';

export const metadata = { title: 'Vérifiez votre e-mail — Encre & Plume' };

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
