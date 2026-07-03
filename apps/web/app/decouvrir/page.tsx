// DR-2 — "Découvrir" catalog landing. Real implementation lives in DecouvrirClient
// (URL-synced filters, loading/empty/error states, right rail). useSearchParams() requires
// a Suspense boundary at the route (same pattern as verifier-email/desabonnement).
import { Suspense } from 'react';
import DecouvrirClient from '../../components/catalog/DecouvrirClient';

export const metadata = { title: 'Découvrir — Encre & Plume' };

export default function DecouvrirPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: 'calc(100dvh - 69px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)' }}>
          Chargement du catalogue…
        </div>
      }
    >
      <DecouvrirClient />
    </Suspense>
  );
}
