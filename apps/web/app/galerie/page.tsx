// DR-5 — Illustration gallery "Galerie" landing. Real implementation lives in GalerieClient
// (URL-synced category/sort, loading/empty/error states, quick-preview overlay). useSearchParams()
// requires a Suspense boundary at the route (same pattern as decouvrir/page.tsx).
import { Suspense } from 'react';
import GalerieClient from '../../components/galerie/GalerieClient';

export const metadata = { title: 'Galerie — Encre & Plume' };

export default function GaleriePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: 'calc(100dvh - 69px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)' }}>
          Chargement de la galerie…
        </div>
      }
    >
      <GalerieClient />
    </Suspense>
  );
}
