'use client';

// MC-1 — "Appels à projets" preview block, replica of prototype TROUVER lines 1010-1020.
// Heading + "Voir tous les appels →" link to the (MC-4) board, and a 2-col grid of call cards.
// "Candidater" is an MC-5 stub (no-op). Empty items → keep heading+link, hide the grid.
import Link from 'next/link';
import type { CallPreview } from '@encre-et-plume/shared';

const cover: React.CSSProperties = {
  width: 70,
  height: 96,
  flex: 'none',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  backgroundColor: 'var(--accent)',
  backgroundImage:
    'radial-gradient(rgba(22,19,15,.5) 1.5px,transparent 1.6px),linear-gradient(150deg,var(--ink) 40%,var(--accent) 40%)',
  backgroundSize: 'var(--dot) var(--dot),cover',
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
};

function callMeta(call: CallPreview): string {
  return call.closesInDays != null
    ? `Clôture ${call.closesInDays} j`
    : `${call.applicationCount} candidatures`;
}

export default function CallsPreview({
  calls,
  showAllLink = true,
  hideHeader = false,
}: {
  calls: CallPreview[];
  showAllLink?: boolean;
  hideHeader?: boolean;
}) {
  return (
    <section
      aria-labelledby={hideHeader ? undefined : 'appels-heading'}
      aria-label={hideHeader ? 'Appels à projets' : undefined}
      style={{ marginBottom: 28 }}
    >
      {!hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 0 14px' }}>
          <h2 id="appels-heading" style={{ fontSize: 24, textTransform: 'uppercase', margin: 0 }}>
            Appels à projets
          </h2>
          {showAllLink && (
            <Link
              href="/appels"
              style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
            >
              Voir tous les appels →
            </Link>
          )}
        </div>
      )}

      {calls.length > 0 && (
        <ul
          className="ep-calls-grid"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, listStyle: 'none', margin: 0, padding: 0 }}
        >
          {calls.map((call) => (
            <li
              key={call.id}
              style={{
                display: 'flex',
                gap: 14,
                background: 'var(--card)',
                border: '3px solid var(--ink)',
                borderRadius: 10,
                padding: 14,
                boxShadow: '4px 4px 0 var(--shadow)',
              }}
            >
              <span aria-hidden="true" style={cover} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', color: 'var(--accent)' }}>
                  {call.heading}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 20,
                    textTransform: 'uppercase',
                    margin: '3px 0 6px',
                    lineHeight: 1,
                  }}
                >
                  {call.title}
                </div>
                <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
                  {call.tags.map((tag) => (
                    <span key={tag} style={chip}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    fontSize: 12,
                    color: 'var(--ink2)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--tone)', border: '2px solid var(--ink)' }}
                  />
                  <span>{call.authorName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{callMeta(call)}</span>
                  <button
                    type="button"
                    onClick={() => {}}
                    style={{
                      marginLeft: 'auto',
                      background: 'var(--ink)',
                      color: 'var(--paper)',
                      border: '2px solid var(--ink)',
                      borderRadius: 6,
                      padding: '8px 14px',
                      minHeight: 40,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Candidater
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
