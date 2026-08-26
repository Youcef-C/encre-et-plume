import { Suspense } from 'react';
import VerifierEmailClient from './VerifierEmailClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Vérification e-mail — Encre & Plume', robots: { index: false, follow: false } };

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
