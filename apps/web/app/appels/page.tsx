// MC-4 — "Appels à projets" board: filters, full call rows, and the "Poster un appel" modal.
import { Suspense } from 'react';
import AppelsClient from '../../components/appels/AppelsClient';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Appels à projets — Encre & Plume', robots: { index: false, follow: false } };

export default function AppelsPage() {
  // Suspense boundary: AppelsClient reads the `?call=` deep-link via useSearchParams (MC-6).
  return (
    <Suspense fallback={<div aria-busy="true" style={{ minHeight: 300 }} />}>
      <AppelsClient />
    </Suspense>
  );
}
