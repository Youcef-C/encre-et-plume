// CS-12 — "Mes projets" dashboard. Thin server shell around the auth-gated client (pattern:
// mes-candidatures / invitations). The Header's "Projets" pill links here.
import { Suspense } from 'react';
import ProjetsClient from '../../components/projets/ProjetsClient';

export const metadata = { title: 'Mes projets — Encre & Plume' };

export default function ProjetsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<div aria-busy="true" style={{ minHeight: 300 }} />}>
      <ProjetsClient />
    </Suspense>
  );
}
