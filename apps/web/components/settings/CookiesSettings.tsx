'use client';

// F-19: "Cookies" section — consent summary per category (F-13) + reopen the F-13 banner.

import { useCookieConsent } from '../../lib/cookie-consent';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 14,
};

export default function CookiesSettings() {
  const { consent, reopen } = useCookieConsent();
  const audienceOn = consent?.audience ?? false;
  const thirdPartyOn = consent?.thirdParty ?? false;

  return (
    <div>
      <div style={rowStyle}>
        <span style={{ fontWeight: 700 }}>Essentiels</span>
        <span style={{ color: 'var(--ink2)' }}>— toujours actifs</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontWeight: 700 }}>Mesure d&apos;audience</span>
        <span style={{ color: audienceOn ? 'var(--accent)' : 'var(--ink2)' }}>
          {audienceOn ? 'Activés' : 'Désactivés'}
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
