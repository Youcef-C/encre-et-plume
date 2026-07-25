// DR-1 — static community CTA band. Replica of prototype ACCUEIL lines 466-474. Covered by e2e (no unit test — static copy).
import Link from 'next/link';

export default function CommunityBand() {
  return (
    <div
      style={{
        marginTop: 42,
        border: '3px solid var(--ink)',
        borderRadius: 12,
        padding: 34,
        background: 'var(--accent)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        boxShadow: '7px 7px 0 var(--shadow)',
        position: 'relative',
        overflow: 'hidden',
        flexWrap: 'wrap',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(22,19,15,.18) 1.6px,transparent 1.7px)',
          backgroundSize: 'var(--dot) var(--dot)',
        }}
      />
      <div style={{ flex: 1, position: 'relative', minWidth: 260 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 4vw, 34px)', textTransform: 'uppercase', lineHeight: 1 }}>
          Une histoire à raconter,
          <br />
          un trait à poser ?
        </div>
        <div style={{ fontSize: 15, marginTop: 10, maxWidth: 560, fontWeight: 500 }}>
          Encre &amp; Plume réunit scénaristes et dessinateur·rices. Trouvez le binôme idéal et créez ensemble, du nemu à la
          publication.
        </div>
      </div>
      <Link
        href="/partenaires"
        className="ep-btn-secondary"
        style={{
          position: 'relative',
          border: '3px solid var(--ink)',
          borderRadius: 6,
          padding: '14px 24px',
          fontSize: 15,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          boxShadow: '4px 4px 0 var(--shadow)',
          textDecoration: 'none',
        }}
      >
        Trouver un·e partenaire
      </Link>
    </div>
  );
}
