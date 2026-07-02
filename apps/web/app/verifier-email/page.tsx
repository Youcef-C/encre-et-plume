import { Suspense } from 'react';
import VerifierEmailClient from './VerifierEmailClient';

export const metadata = { title: 'Vérification e-mail — Encre & Plume' };

export default function VerifierEmailPage() {
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
          Vérification en cours…
        </div>
      }
    >
      <VerifierEmailClient />
    </Suspense>
  );
}
