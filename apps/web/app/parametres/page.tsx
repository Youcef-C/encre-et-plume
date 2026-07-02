'use client';

// F-14: /parametres — authenticated settings page hosting "Mes données" section.
// Redirects to /connexion when not logged in.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/session';
import MesDonnees from '../../components/MesDonnees';
import PreferencesNotifications from '../../components/PreferencesNotifications';
import SupprimerCompteModal from '../../components/SupprimerCompteModal';

export default function ParametresPage() {
  const { account, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !account) {
      router.replace('/connexion');
    }
  }, [account, loading, router]);

  if (loading) {
    return (
      <main
        aria-busy="true"
        style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}
      >
        <div
          aria-hidden="true"
          className="ep-skeleton-delayed"
          style={{
            height: 32,
            width: 180,
            background: 'var(--tone)',
            borderRadius: 6,
            marginBottom: 32,
          }}
        />
      </main>
    );
  }

  if (!account) return null;

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
      {/* Page heading */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          margin: '0 0 32px',
          color: 'var(--ink)',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        Paramètres
      </h1>

      {/* Notification preferences section */}
      <section
        aria-labelledby="preferences-notif-heading"
        className="ep-card"
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <h2
          id="preferences-notif-heading"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            margin: '0 0 24px',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            paddingBottom: 14,
            borderBottom: '2px solid var(--border)',
          }}
        >
          Préférences de notification
        </h2>
        <PreferencesNotifications />
      </section>

      {/* Mes données section */}
      <section
        aria-labelledby="mes-donnees-heading"
        className="ep-card"
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <h2
          id="mes-donnees-heading"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            margin: '0 0 24px',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            paddingBottom: 14,
            borderBottom: '2px solid var(--border)',
          }}
        >
          Mes données
        </h2>

        {/* Export block */}
        <div
          style={{
            paddingBottom: 24,
            marginBottom: 24,
            borderBottom: '1.5px solid var(--border)',
          }}
        >
          <MesDonnees />
        </div>

        {/* Deletion block */}
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              margin: '0 0 10px',
              color: 'var(--accent)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            Zone de danger
          </h3>
          <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 14px', lineHeight: 1.55 }}>
            La suppression de votre compte est définitive et irréversible conformément à l&apos;article 17 du RGPD (droit à l&apos;effacement).
          </p>
          <SupprimerCompteModal />
        </div>
      </section>
    </main>
  );
}
