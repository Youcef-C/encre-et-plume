// Home page — placeholder until subsequent stories (DR-*, etc.) build the real home screen.
export default function HomePage() {
  return (
    <section
      style={{
        padding: '60px 28px',
        maxWidth: 900,
        margin: '0 auto',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(48px, 8vw, 96px)',
          textTransform: 'uppercase',
          lineHeight: 0.92,
          marginBottom: 24,
        }}
      >
        Encre &amp; Plume
      </h1>
      <p style={{ fontSize: 18, color: 'var(--ink2)', fontWeight: 500 }}>
        La plateforme de création manga française.
      </p>
    </section>
  );
}
