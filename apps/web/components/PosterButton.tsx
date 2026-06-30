import Link from 'next/link';

// ponytail: seam - /publier destination owned by the publishing/CS epic
export default function PosterButton() {
  return (
    <Link
      href="/publier"
      aria-label="Poster"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: 'var(--ink)',
        color: 'var(--paper)',
        border: '2px solid var(--ink)',
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 14,
        textDecoration: 'none',
        boxShadow: '3px 3px 0 var(--shadow)',
        letterSpacing: '0.02em',
        flexShrink: 0,
      }}
    >
      ＋ Poster
    </Link>
  );
}
