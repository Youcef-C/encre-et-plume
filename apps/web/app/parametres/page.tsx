'use client';

// F-14: /parametres — authenticated settings page hosting "Mes données" section.
// F-18: Adds "Sécurité" section (email, password, sessions, 2FA).
// Redirects to /connexion when not logged in.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../lib/session';
import MesDonnees from '../../components/MesDonnees';
import PreferencesNotifications from '../../components/PreferencesNotifications';
import SupprimerCompteModal from '../../components/SupprimerCompteModal';
import SecurityIdentifiants from '../../components/security/SecurityIdentifiants';
import SecuritySessions from '../../components/security/SecuritySessions';
import SecurityTwoFactor from '../../components/security/SecurityTwoFactor';
import CookiesSettings from '../../components/settings/CookiesSettings';
import SettingsNav from '../../components/settings/SettingsNav';
import AdultContentSettings from '../../components/settings/AdultContentSettings';

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

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 20,
    margin: '0 0 24px',
    color: 'var(--ink)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    paddingBottom: 14,
    borderBottom: '2px solid var(--border)',
  };

  const subHeadingStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 16,
    margin: '0 0 10px',
    color: 'var(--accent)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  };

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

      <SettingsNav />

      {/* Apparence section removed — theme picker disabled for now (light forced); see git history */}

      {/* Notification preferences section */}
      <details
        id="notifications"
        className="ep-card ep-settings-section"
        open
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <summary className="ep-settings-summary">
          <h2 id="preferences-notif-heading" style={sectionHeadingStyle}>
            Préférences de notification
          </h2>
        </summary>
        <PreferencesNotifications />
      </details>

      {/* Cookies section (F-19, net-new; consent summary reuses F-13 useCookieConsent) */}
      <details
        id="cookies"
        className="ep-card ep-settings-section"
        open
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <summary className="ep-settings-summary">
          <h2 id="cookies-heading" style={sectionHeadingStyle}>
            Cookies
          </h2>
        </summary>
        <CookiesSettings />
      </details>

      {/* Sécurité section (F-18) */}
      <details
        id="securite"
        className="ep-card ep-settings-section"
        open
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <summary className="ep-settings-summary">
          <h2 id="securite-heading" style={sectionHeadingStyle}>
            Sécurité
          </h2>
        </summary>

        {/* Identifiants block */}
        <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1.5px solid var(--border)' }}>
          <h3 style={subHeadingStyle}>Identifiants</h3>
          <SecurityIdentifiants />
        </div>

        {/* Sessions actives block */}
        <div style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1.5px solid var(--border)' }}>
          <h3 style={subHeadingStyle}>Sessions actives</h3>
          <SecuritySessions />
        </div>

        {/* 2FA block */}
        <div>
          <h3 style={subHeadingStyle}>Double authentification (2FA)</h3>
          <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 16px', lineHeight: 1.55 }}>
            La double authentification ajoute une couche de sécurité supplémentaire à votre compte.
            Elle est entièrement optionnelle.
          </p>
          <SecurityTwoFactor />
        </div>
      </details>

      {/* Contenu 18+ section (DR-10) */}
      <details
        id="contenu-adulte"
        className="ep-card ep-settings-section"
        open
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <summary className="ep-settings-summary">
          <h2 id="contenu-adulte-heading" style={sectionHeadingStyle}>
            Contenu 18+
          </h2>
        </summary>
        <AdultContentSettings />
      </details>

      {/* Mes données section */}
      <details
        id="mes-donnees"
        className="ep-card ep-settings-section"
        open
        style={{ padding: '24px 28px', marginBottom: 24 }}
      >
        <summary className="ep-settings-summary">
          <h2 id="mes-donnees-heading" style={sectionHeadingStyle}>
            Mes données
          </h2>
        </summary>

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
          <h3 style={{ ...subHeadingStyle, color: 'var(--accent)' }}>
            Zone de danger
          </h3>
          <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 14px', lineHeight: 1.55 }}>
            La suppression de votre compte est définitive et irréversible conformément à l&apos;article 17 du RGPD (droit à l&apos;effacement).
          </p>
          <SupprimerCompteModal />
        </div>
      </details>
    </main>
  );
}
