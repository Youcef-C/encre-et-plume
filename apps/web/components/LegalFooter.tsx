'use client';

// F-13: Global legal footer — quiet manga-zine styling, responsive wrap.
// Mounted in layout.tsx below <main>; always visible.

import Link from 'next/link';
import { useCookieConsent } from '../lib/cookie-consent';

export default function LegalFooter() {
  const { reopen } = useCookieConsent();

  return (
    <footer
      aria-label="Informations légales"
      style={{
        borderTop: '1px solid var(--tone)',
        background: 'var(--card)',
        padding: '18px 24px',
        marginTop: 'auto',
      }}
    >
      <nav
        aria-label="Liens légaux"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 20px',
          maxWidth: 1200,
          margin: '0 auto',
          fontSize: 13,
          color: 'var(--ink2)',
        }}
      >
        <Link
          href="/cgu"
          style={{ color: 'var(--ink2)', textDecoration: 'none' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--ink2)')}
        >
          CGU
        </Link>

        <span aria-hidden="true" style={{ color: 'var(--tone)' }}>·</span>

        <Link
          href="/confidentialite"
          style={{ color: 'var(--ink2)', textDecoration: 'none' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--ink2)')}
        >
          Politique de confidentialité
        </Link>

        <span aria-hidden="true" style={{ color: 'var(--tone)' }}>·</span>

        <Link
          href="/mentions-legales"
          style={{ color: 'var(--ink2)', textDecoration: 'none' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--ink2)')}
        >
          Mentions légales
        </Link>

        <span aria-hidden="true" style={{ color: 'var(--tone)' }}>·</span>

        <button
          onClick={reopen}
          aria-label="Gérer les cookies"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--ink2)',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--ink)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--ink2)')}
        >
          Gérer les cookies
        </button>

        <span aria-hidden="true" style={{ color: 'var(--tone)' }}>·</span>

        <span>© Encre &amp; Plume</span>
      </nav>
    </footer>
  );
}
