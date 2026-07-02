'use client';

// ponytail: reusable seam; PUB-1/MR-* attach it to their gated action surfaces
export default function VerificationGatePrompt() {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '6px 12px',
        background: 'var(--accent-soft)',
        border: '2px solid var(--accent)',
        borderRadius: 4,
        fontSize: 13,
        color: 'var(--ink)',
        fontWeight: 600,
      }}
    >
      Confirmez votre e-mail pour continuer.
    </span>
  );
}
