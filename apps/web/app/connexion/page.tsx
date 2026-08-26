import Link from 'next/link';
import LoginForm from '../../components/LoginForm';
import GuestOnly from '../../components/GuestOnly';

// F-24 F5: private surface — never indexed.
export const metadata = { title: 'Connexion — Encre & Plume', robots: { index: false, follow: false } };

export default function ConnexionPage() {
  return (
    <GuestOnly>
    <div
      style={{
        minHeight: 'calc(100dvh - 69px)', // subtract header height
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}
    >
      <div
        className="ep-card"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '40px 36px',
        }}
      >
        {/* Heading */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 42,
            textTransform: 'uppercase',
            lineHeight: 0.9,
            marginBottom: 8,
          }}
        >
          Connexion
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 32 }}>
          Content de vous revoir sur Encre &amp; Plume.
        </p>

        <LoginForm />

        <p style={{ marginTop: 24, fontSize: 14, color: 'var(--ink2)', textAlign: 'center' }}>
          Pas encore de compte ?{' '}
          <Link
            href="/inscription"
            style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
          >
            S&apos;inscrire
          </Link>
        </p>
      </div>
    </div>
    </GuestOnly>
  );
}
