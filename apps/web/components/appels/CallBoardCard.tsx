'use client';

// MC-4 — full-width call row for the "Appels à projets" board. Replica of prototype rows
// 1592–1603: flex row, card bg, 3px ink border, radius 10, 5px 5px 0 shadow. 90×120 sample thumb
// (real img when sampleUrl, else the dashed "sample slot" placeholder). Directional eyebrow (text,
// not color-only), title, genre/scope chips, description, author + status line. "Candidater" is an
// MC-5 no-op stub, hidden on closed calls and on the viewer's own calls.
import type { CallCard } from '@encre-et-plume/shared';

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
};

// Halftone-dot placeholder fill for a missing sample (prototype 1593 gradient).
const placeholderFill: React.CSSProperties = {
  backgroundColor: 'var(--accent)',
  backgroundImage:
    'radial-gradient(rgba(22,19,15,.5) 1.5px,transparent 1.6px),linear-gradient(150deg,var(--ink) 40%,var(--accent) 40%)',
  backgroundSize: 'var(--dot) var(--dot),cover',
};

function statusText(call: CallCard): string {
  if (call.closesInDays != null) return `Clôture dans ${call.closesInDays} j`;
  return `${call.applicationCount} candidatures`;
}

export default function CallBoardCard({
  call,
  onCandidater,
}: {
  call: CallCard;
  onCandidater?: () => void;
}) {
  const closed = call.status === 'closed';
  const showCandidater = !closed && !call.isOwner;

  return (
    <article
      className="ep-call-board-card"
      style={{
        display: 'flex',
        gap: 16,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        padding: 16,
        boxShadow: '5px 5px 0 var(--shadow)',
      }}
    >
      {call.sampleUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={call.sampleUrl}
          alt={`Visuel d'exemple — ${call.title}`}
          width={90}
          height={120}
          style={{
            width: 90,
            height: 120,
            flex: 'none',
            objectFit: 'cover',
            border: '2px solid var(--ink)',
            borderRadius: 6,
          }}
        />
      ) : (
        <div
          role="img"
          aria-label="Aucun visuel d'exemple"
          style={{
            width: 90,
            height: 120,
            flex: 'none',
            border: '2px dashed var(--ink)',
            borderRadius: 6,
            ...placeholderFill,
          }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--accent)' }}>
          {call.heading}
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 400,
            textTransform: 'uppercase',
            margin: '3px 0 6px',
            lineHeight: 1,
          }}
        >
          {call.title}
        </h3>

        {call.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {call.tags.map((tag) => (
              <span key={tag} style={chip}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>{call.description}</p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 11,
            flexWrap: 'wrap',
            fontSize: 13,
            color: 'var(--ink2)',
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--tone)', border: '2px solid var(--ink)', flex: 'none' }}
          />
          <span>{call.authorName}</span>
          <span aria-hidden="true">·</span>
          {closed ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent)',
                border: '2px solid var(--accent)',
                borderRadius: 5,
                padding: '2px 9px',
              }}
            >
              Clôturé
            </span>
          ) : (
            <span>{statusText(call)}</span>
          )}

          {showCandidater &&
            (call.hasApplied ? (
              // MC-5: already applied — disabled, the label itself carries the state (not color-only).
              <button
                type="button"
                disabled
                aria-disabled="true"
                style={{
                  marginLeft: 'auto',
                  background: 'var(--tone)',
                  color: 'var(--ink2)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 16px',
                  minHeight: 44,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'default',
                }}
              >
                Candidature envoyée
              </button>
            ) : (
              <button
                type="button"
                onClick={onCandidater}
                style={{
                  marginLeft: 'auto',
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 16px',
                  minHeight: 44,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 var(--accent)',
                }}
              >
                Candidater
              </button>
            ))}
        </div>
      </div>
    </article>
  );
}
