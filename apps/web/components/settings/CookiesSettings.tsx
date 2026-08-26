'use client';

// F-19: "Cookies" section — consent summary per category (F-13) + reopen the F-13 banner.
// F-23 (B-3): audience measurement is cookieless and exempt from consent, so its row states a
// fact instead of a preference. `consent.audience` stays in the seam but is deliberately not read
// here — it never changes, and rendering it read « Désactivés » while measurement was running.

import { useCookieConsent } from '../../lib/cookie-consent';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 14,
};

export default function CookiesSettings() {
  const { consent, reopen } = useCookieConsent();
  const thirdPartyOn = consent?.thirdParty ?? false;

  return (
    <div>
      <div style={rowStyle}>
        <span style={{ fontWeight: 700 }}>Essentiels</span>
        <span style={{ color: 'var(--ink2)' }}>— toujours actifs</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontWeight: 700 }}>Mesure d&apos;audience</span>
        <span style={{ color: 'var(--ink2)', flex: '1 1 220px', textAlign: 'right', lineHeight: 1.5 }}>
          — sans cookie, toujours active : aucun identifiant n&apos;est stocké sur votre appareil.{' '}
          <a
            href="/confidentialite"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', fontWeight: 700 }}
          >
            Article 9 bis de la politique de confidentialité
          </a>
        </span>
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={{ fontWeight: 700 }}>Contenus tiers</span>
        <span style={{ color: thirdPartyOn ? 'var(--accent)' : 'var(--ink2)' }}>
          {thirdPartyOn ? 'Activés' : 'Désactivés'}
        </span>
      </div>
      <button
        type="button"
        onClick={reopen}
        className="ep-btn-secondary"
        style={{ marginTop: 16, minHeight: 44, fontSize: 14 }}
      >
        Gérer les cookies
      </button>
    </div>
  );
}
