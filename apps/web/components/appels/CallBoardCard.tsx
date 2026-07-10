'use client';

// MC-4 — full-width call row for the "Appels à projets" board. Replica of prototype rows
// 1592–1603: flex row, card bg, 3px ink border, radius 10, 5px 5px 0 shadow. 90×120 sample thumb
// (real img when sampleUrl, else the dashed "sample slot" placeholder). Directional eyebrow (text,
// not color-only), title, genre/scope chips, description, author + status line. "Candidater" is an
// MC-5 no-op stub, hidden on closed calls and on the viewer's own calls.
import { useState } from 'react';
import type { CallCard } from '@encre-et-plume/shared';
import { roleGateHint } from '../../lib/calls';
import StatusBadge from '../candidatures/StatusBadge';

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

// §8: "1 place restante" / "N places restantes".
function seatsText(remaining: number): string {
  return `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
}

export default function CallBoardCard({
  call,
  onCandidater,
  onVoirDetail,
  onWithdraw,
}: {
  call: CallCard;
  onCandidater?: () => void;
  onVoirDetail?: () => void;
  onWithdraw?: (applicationId: string) => Promise<void> | void;
}) {
  const closed = call.status === 'closed';
  const showCandidater = !closed && !call.isOwner;
  const hintId = `call-role-hint-${call.id}`;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmWithdraw() {
    if (!call.myApplicationId || !onWithdraw) return;
    setBusy(true);
    try {
      await onWithdraw(call.myApplicationId);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article
      id={`call-${call.id}`}
      tabIndex={-1}
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
          {!closed && call.remainingSeats > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{seatsText(call.remainingSeats)}</span>
            </>
          )}

          {/* Actions — "Voir le détail" (all cards) then the state-dependent Candidater slot. */}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {onVoirDetail && (
              <button
                type="button"
                onClick={onVoirDetail}
                aria-label={`Voir le détail — ${call.title}`}
                style={{
                  background: 'var(--card)',
                  color: 'var(--ink)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 14px',
                  minHeight: 44,
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Voir le détail
              </button>
            )}

          {/* MC-14: when the call auto-closed on the viewer's own accepted seat, showCandidater
              (`!closed && …`) has already hidden the applied-pill slot below — so surface the decided
              verdict here, independent of that gate. Pending-on-closed keeps the "Clôturé" meta line. */}
          {closed &&
            !call.isOwner &&
            (call.myApplicationStatus === 'accepted' || call.myApplicationStatus === 'rejected') && (
              <StatusBadge status={call.myApplicationStatus} />
            )}

          {showCandidater &&
            (call.hasApplied ? (
              // MC-5: already applied — the label carries the state (not color-only). MC-6 owner
              // extension: a "Retirer" affordance (inline confirm) withdraws a pending application
              // and flips the card back to "Candidater".
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* MC-14: once decided, the pill carries the actual status (StatusBadge) instead
                    of "Candidature envoyée"; pending/historic (null) keeps the sent label. */}
                {call.myApplicationStatus === 'accepted' || call.myApplicationStatus === 'rejected' ? (
                  <StatusBadge status={call.myApplicationStatus} />
                ) : (
                  <span
                    style={{
                      background: 'var(--tone)',
                      color: 'var(--ink2)',
                      border: '2px solid var(--ink)',
                      borderRadius: 6,
                      padding: '7px 16px',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Candidature envoyée
                  </span>
                )}
                {call.myApplicationId &&
                  onWithdraw &&
                  (confirming ? (
                    <span role="group" aria-label="Confirmer le retrait de la candidature" style={{ display: 'inline-flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={confirmWithdraw}
                        disabled={busy}
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          border: '2px solid var(--ink)',
                          borderRadius: 6,
                          padding: '7px 13px',
                          minHeight: 44,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        Confirmer le retrait
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        disabled={busy}
                        style={{
                          background: 'var(--card)',
                          color: 'var(--ink)',
                          border: '2px solid var(--ink)',
                          borderRadius: 6,
                          padding: '7px 13px',
                          minHeight: 44,
                          fontWeight: 700,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        Annuler
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      style={{
                        background: 'var(--card)',
                        color: 'var(--ink)',
                        border: '2px solid var(--ink)',
                        borderRadius: 6,
                        padding: '7px 13px',
                        minHeight: 44,
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      Retirer
                    </button>
                  ))}
              </span>
            ) : call.viewerHasRole ? (
              <button
                type="button"
                onClick={onCandidater}
                style={{
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
            ) : (
              // MC-4X role gate: the call seeks a role the viewer lacks — disabled + French hint
              // (mirrors the server rule via CallCard.viewerHasRole; the apply modal never opens).
              <button
                type="button"
                disabled
                aria-describedby={hintId}
                style={{
                  background: 'var(--tone)',
                  color: 'var(--ink2)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 16px',
                  minHeight: 44,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'not-allowed',
                }}
              >
                Candidater
              </button>
            ))}
          </span>
        </div>

        {showCandidater && !call.hasApplied && !call.viewerHasRole && (
          <p id={hintId} style={{ fontSize: 12, color: 'var(--ink2)', margin: '8px 0 0', textAlign: 'right' }}>
            {roleGateHint(call.seekingRoles)}
          </p>
        )}
      </div>
    </article>
  );
}
