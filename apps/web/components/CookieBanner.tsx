'use client';

// F-13: CNIL-compliant cookie banner.
// - Fixed bottom sheet, non-focus-stealing (aria-modal="false"), keyboard-reachable.
// - Equal prominence: accept/refuse same class; Personnaliser for granular control.
// - Never covers the full mobile viewport.

import { useState } from 'react';
import { useCookieConsent } from '../lib/cookie-consent';
import OnBrandCheckbox from './form/OnBrandCheckbox';

export default function CookieBanner() {
  const { isOpen, save } = useCookieConsent();
  const [showPanel, setShowPanel] = useState(false);
  const [audience, setAudience] = useState(false);
  const [thirdParty, setThirdParty] = useState(false);

  if (!isOpen) return null;

  const acceptAll = () => save({ audience: true, thirdParty: true });
  const refuseAll = () => save({ audience: false, thirdParty: false });
  const saveCustom = () => save({ audience, thirdParty });

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Gestion des cookies"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--card)',
        borderTop: '3px solid var(--border)',
        boxShadow: '0 -4px 0 var(--shadow)',
        padding: '20px 24px',
        maxHeight: '50vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
        }}
      >
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 14,
            color: 'var(--ink)',
            lineHeight: 1.5,
          }}
        >
          Encre &amp; Plume utilise des cookies pour améliorer votre expérience.
          Les cookies essentiels sont nécessaires au fonctionnement du site.
        </p>

        {/* Personalize panel */}
        {showPanel && (
          <div
            style={{
              background: 'var(--paper)',
              border: '2px solid var(--border)',
              borderRadius: 8,
              padding: '16px',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Essentiels — always on */}
            <OnBrandCheckbox
              checked
              disabled
              aria-label="Essentiels"
              label={
                <>
                  <span style={{ fontWeight: 700 }}>Essentiels</span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink2)', marginLeft: 8 }}>
                    — toujours actifs
                  </span>
                </>
              }
            />

            {/* Mesure d'audience */}
            <OnBrandCheckbox
              checked={audience}
              onChange={(e) => setAudience(e.target.checked)}
              label="Mesure d'audience"
            />

            {/* Contenus tiers */}
            <OnBrandCheckbox
              checked={thirdParty}
              onChange={(e) => setThirdParty(e.target.checked)}
              label="Contenus tiers"
            />

            <button
              onClick={saveCustom}
              className="ep-btn-secondary"
              style={{ alignSelf: 'flex-start', fontSize: 14, padding: '9px 18px', marginTop: 4 }}
            >
              Enregistrer mes choix
            </button>
          </div>
        )}

        {/* Action buttons — equal prominence (same className) */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <button onClick={acceptAll} className="ep-btn-primary" style={{ minHeight: 44, fontSize: 14 }}>
            Tout accepter
          </button>
          <button onClick={refuseAll} className="ep-btn-primary" style={{ minHeight: 44, fontSize: 14 }}>
            Tout refuser
          </button>
          <button
            onClick={() => setShowPanel((v) => !v)}
            className="ep-btn-secondary"
            style={{ minHeight: 44, fontSize: 14 }}
          >
            Personnaliser
          </button>
        </div>
      </div>
    </div>
  );
}
