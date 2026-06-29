// Stub — real content arrives in PE-7.
export default function EspaceRedactionPage() {
  return (
    <section style={{ padding: '60px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Rédacteur·rice
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 6vw, 60px)',
          textTransform: 'uppercase',
          lineHeight: 1,
          margin: '0 0 16px',
        }}
      >
        Espace rédaction
      </h1>
      <p style={{ fontSize: 16, color: 'var(--ink2)', fontWeight: 500 }}>
        À venir — PE-7.
      </p>
    </section>
  );
}
