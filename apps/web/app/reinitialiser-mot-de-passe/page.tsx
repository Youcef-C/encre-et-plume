import { Suspense } from 'react';
import ReinitialiserMotDePasseClient from './ReinitialiserMotDePasseClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Réinitialiser le mot de passe — Encre & Plume', robots: { index: false, follow: false } };

export default function ReinitialiserMotDePassePage() {
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
      <ReinitialiserMotDePasseClient />
    </Suspense>
  );
}
