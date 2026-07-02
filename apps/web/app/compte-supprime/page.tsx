// F-14: /compte-supprime — public landing after successful account deletion.
import Link from 'next/link';

export default function CompteSupprimePage() {
  return (
    <main
      style={{
        minHeight: '60dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        className="ep-card"
        style={{
          maxWidth: 480,
          width: '100%',
          padding: '40px 36px',
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontSize: 36, display: 'block', marginBottom: 18 }}
        >
          ✓
        </span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            margin: '0 0 16px',
            color: 'var(--ink)',
            letterSpacing: '0.02em',
          }}
        >
          Votre compte a été supprimé.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink2)', margin: '0 0 28px', lineHeight: 1.6 }}>
          Vos données ont été effacées conformément au RGPD. Merci d&apos;avoir utilisé Encre &amp; Plume.
        </p>
        <Link
          href="/"
          className="ep-btn-secondary"
          style={{ display: 'inline-block', textDecoration: 'none', fontSize: 14 }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
