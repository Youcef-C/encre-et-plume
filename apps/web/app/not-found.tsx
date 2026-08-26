import Link from 'next/link';

/**
 * F-24 FE-4 — the page behind every `notFound()`. The prototype draws no 404 frame, so this reuses
 * the « introuvable » block already drawn on the œuvre and profil screens verbatim (D-3): the same
 * centred column, the same Anton display heading at `clamp(32px, 6vw, 56px)`, the same `--ink2`
 * body line. No `background` on the wrapper — the body's halftone paper shows through.
 */
export default function NotFound() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 6vw, 56px)',
          textTransform: 'uppercase',
          margin: '0 0 12px',
        }}
      >
        Page introuvable
      </h1>
      <p style={{ color: 'var(--ink2)', fontSize: 15, margin: '0 0 24px' }}>
        Cette page n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="ep-btn-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          padding: '10px 20px',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
