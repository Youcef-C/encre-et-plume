// DR-7 — "Classement" all-time ranking. Real implementation lives in ClassementClient
// (URL-synced genre filter, loading/empty/error states). useSearchParams() requires a
// Suspense boundary at the route (same pattern as decouvrir/page.tsx).
import { Suspense } from 'react';
import ClassementClient from '../../components/classement/ClassementClient';

export const metadata = { title: 'Classement — Encre & Plume' };

export default function ClassementPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: 'calc(100dvh - 69px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink2)' }}>
          Chargement du classement…
        </div>
      }
    >
      <ClassementClient />
    </Suspense>
  );
}
