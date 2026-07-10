'use client';

// CS-1 — "/creer" route: the "Nouveau projet" 3-step wizard. Authenticated users only (story authz
// is authenticated-only, NOT creator-gated — the wizard's Type step is the entry point for every
// creator path). Anonymous visitors bounce to sign-in with a return target.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/session';
import NewProjectWizard from '../../components/creer/NewProjectWizard';

const ROUTE = '/creer';

export default function NouveauProjetPage() {
  const { account, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!account) router.replace(`/connexion?next=${ROUTE}`);
  }, [account, loading, router]);

  if (loading || !account) {
    return (
      <div role="status" aria-label="Chargement…" className="ep-skeleton-delayed" style={{ maxWidth: 740, margin: '0 auto', padding: 30 }}>
        <div aria-hidden="true" style={{ height: 420, background: 'var(--tone)', opacity: 0.4, borderRadius: 12 }} />
      </div>
    );
  }

  return <NewProjectWizard />;
}
