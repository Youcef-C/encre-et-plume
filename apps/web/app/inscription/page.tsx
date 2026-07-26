import Link from 'next/link';
import SignupForm from '../../components/SignupForm';
import GuestOnly from '../../components/GuestOnly';

export const metadata = { title: 'Inscription — Encre & Plume' };

export default function InscriptionPage() {
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
          Inscription
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 32 }}>
          Rejoignez la plateforme de cr&eacute;ation manga fran&ccedil;aise.
        </p>

        <SignupForm />

        <p style={{ marginTop: 24, fontSize: 14, color: 'var(--ink2)', textAlign: 'center' }}>
          D&eacute;j&agrave; un compte ?{' '}
          <Link
            href="/connexion"
            style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
    </GuestOnly>
  );
}
