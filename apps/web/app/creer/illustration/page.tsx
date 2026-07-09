'use client';

// DR-12 FE-1 — "Publier une illustration" route (interim CS-3 stand-in). The Galerie CTA already
// links here; anonymous users are redirected to sign-in and non-creators see a French notice
// (server also enforces the creator rule — the form surfaces its 403). CS-3 replaces this page.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProfileResponse } from '@encre-et-plume/shared';
import { useSession } from '../../../lib/session';
import { getProfile } from '../../../lib/api';
import PublishIllustrationForm from '../../../components/creer/PublishIllustrationForm';

const ROUTE = '/creer/illustration';

export default function PublishIllustrationPage() {
  const { account, loading } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace(`/connexion?next=${ROUTE}`);
      return;
    }
    setProfileLoading(true);
    getProfile(account.slug)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setProfileLoading(false));
  }, [account, loading, router]);

  if (loading || !account || profileLoading) {
    return (
      <div role="status" aria-label="Chargement…" className="ep-skeleton-delayed" style={{ maxWidth: 640, margin: '0 auto', padding: '28px' }}>
        <div aria-hidden="true" style={{ height: 40, width: '55%', background: 'var(--tone)', opacity: 0.5, borderRadius: 4, marginBottom: 20 }} />
        <div aria-hidden="true" style={{ height: 160, background: 'var(--tone)', opacity: 0.4, borderRadius: 8 }} />
      </div>
    );
  }

  // Creator gate (F-2/D7): non-empty Profile.creatorRoles. Server also enforces it.
  if (profile && profile.creatorRoles.length === 0) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 44px)', textTransform: 'uppercase', margin: '0 0 12px' }}>
          Réservé aux créateur·rices
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 16 }}>
          Publier une illustration nécessite un profil de dessinateur·rice ou de scénariste.
        </p>
        <Link href={`/${account.slug}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
          Compléter mon profil →
        </Link>
      </div>
    );
  }

  return <PublishIllustrationForm />;
}
