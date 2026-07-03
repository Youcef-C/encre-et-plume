// DR-4 — Chapter reader "Lecteur". Server component wrapper: resolves the dynamic slug then
// delegates to the client Reader (fetching, session, ?chapitre= query, all interactive state).
// Suspense boundary required because Reader calls useSearchParams() (same pattern as
// app/decouvrir/page.tsx).
import { Suspense } from 'react';
import Reader from '../../../components/lecteur/Reader';

type Props = { params: Promise<{ slug: string }> };

export default async function LecteurPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense
      fallback={<div role="status" aria-label="Chargement du lecteur…" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)' }} />}
    >
      <Reader slug={slug} />
    </Suspense>
  );
}
