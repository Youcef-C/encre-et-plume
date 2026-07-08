'use client';

// MC-4X — "Voir le détail" modal. Induced addition (no drawn prototype frame): replicates the
// established PostCallModal/ApplyCallModal shell (overlay, 3px ink border, radius 12,
// 7px 7px 0 shadow, header + XIcon "Fermer", focus trap, Esc/overlay close, role=dialog). Fetches
// GET /calls/:id and shows the FULL call: description, all sample images, PDF document links,
// author/meta/chips/deadline/applicant count, and the same gated Candidater as the board card.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CREATOR_ROLES, type CallDetail } from '@encre-et-plume/shared';
import { getCallDetail } from '../../lib/api';
import { roleGateHint, ROLE_LABEL } from '../../lib/calls';
import { XIcon } from '../icons';

function focusTrap(e: React.KeyboardEvent, dialogRef: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !dialogRef.current) return;
  const focusable = Array.from(
    dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

// bytes → "2,3 Mo" (fr-FR, one decimal).
function fmtSize(bytes: number): string {
  const mo = bytes / 1_048_576;
  return `${mo.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
}

const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.03em',
  margin: '18px 0 8px',
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--paper)',
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
};

const closedBadge: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  border: '2px solid var(--accent)',
  borderRadius: 5,
  padding: '2px 9px',
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; call: CallDetail }
  | { status: 'error' };

export default function CallDetailModal({
  callId,
  onClose,
  onCandidater,
}: {
  callId: string;
  onClose: () => void;
  onCandidater: (call: CallDetail) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'call-detail-title';
  const hintId = 'call-detail-role-hint';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getCallDetail(callId)
      .then((call) => !cancelled && setState({ status: 'ready', call }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [callId, reloadKey]);

  const call = state.status === 'ready' ? state.call : null;
  const closed = call?.status === 'closed';
  const showGate = call && !closed && !call.isOwner;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={call ? titleId : undefined}
        aria-label={call ? undefined : 'Détail de l’appel'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
            return;
          }
          focusTrap(e, dialogRef);
        }}
        style={{
          width: 640,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
            position: 'sticky',
            top: 0,
            background: 'var(--card)',
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--ink2)' }}>
            Détail de l&apos;appel
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {state.status === 'loading' && (
          <div role="status" aria-label="Chargement du détail…" style={{ padding: 24 }}>
            <div className="ep-skeleton-delayed" style={{ height: 24, width: '60%', background: 'var(--tone)', borderRadius: 6, marginBottom: 12 }} />
            <div className="ep-skeleton-delayed" style={{ height: 120, background: 'var(--tone)', borderRadius: 8, opacity: 0.6 }} />
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" style={{ padding: 24 }}>
            <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 12 }}>
              Impossible de charger le détail de l&apos;appel.
            </p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{
                fontSize: 13,
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#fff',
                border: '2px solid var(--ink)',
                borderRadius: 6,
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
          </div>
        )}

        {call && (
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--accent)' }}>
              {call.heading}
            </div>
            <h2
              id={titleId}
              style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 400, textTransform: 'uppercase', margin: '4px 0 8px', lineHeight: 1 }}
            >
              {call.title}
            </h2>

            {call.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {call.tags.map((tag) => (
                  <span key={tag} style={chip}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Meta line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink2)' }}>
              <span
                aria-hidden="true"
                style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--tone)', border: '2px solid var(--ink)', flex: 'none' }}
              />
              <span>{call.authorName}</span>
              <span aria-hidden="true">·</span>
              <span>Publié le {fmtDate(call.createdAt)}</span>
              <span aria-hidden="true">·</span>
              {closed ? (
                <span style={closedBadge}>Clôturé</span>
              ) : call.deadline ? (
                <span>Clôture le {fmtDate(call.deadline)}</span>
              ) : null}
              {(closed || call.deadline) && <span aria-hidden="true">·</span>}
              <span>{call.applicationCount} candidatures</span>
            </div>

            {/* Postes — §8: accepted vs sought per role. */}
            <div style={sectionHeading}>Postes</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CREATOR_ROLES.filter((r) => (call.seats[r] ?? 0) > 0).map((r) => (
                <span
                  key={r}
                  style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 10px', background: 'var(--card)' }}
                >
                  {ROLE_LABEL[r]} : {call.acceptedByRole[r] ?? 0}/{call.seats[r]}
                </span>
              ))}
            </div>

            {/* Description */}
            <div style={sectionHeading}>Description</div>
            <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {call.description}
            </p>

            {/* Visuels d'exemple — omitted when empty */}
            {call.samples.length > 0 && (
              <>
                <div style={sectionHeading}>Visuels d&apos;exemple</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {call.samples.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt={`Visuel d'exemple ${i + 1} — ${call.title}`}
                      style={{ width: 160, height: 200, objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 6, flex: 'none' }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Documents joints — omitted when empty */}
            {call.documents.length > 0 && (
              <>
                <div style={sectionHeading}>Documents joints</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {call.documents.map((doc, i) => (
                    <li key={doc.url}>
                      <a
                        href={doc.url}
                        download
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          maxWidth: '100%',
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          border: '2px solid var(--ink)',
                          borderRadius: 6,
                          padding: '8px 12px',
                          minHeight: 44,
                          boxSizing: 'border-box',
                          background: 'var(--card)',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Document {i + 1} (PDF · {fmtSize(doc.size)})
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* ÉQUIPE — req6: author + accepted project collaborators + accepted applicants. */}
            {call.team.length > 0 && (
              <>
                <div style={sectionHeading}>ÉQUIPE</div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {call.team.map((member) => (
                    <li
                      key={member.userId}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, border: '2px solid var(--ink)', borderRadius: 8, padding: '8px 12px', background: 'var(--card)' }}
                    >
                      {member.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.avatarUrl}
                          alt=""
                          width={36}
                          height={36}
                          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ink)', flex: 'none' }}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            border: '2px solid var(--ink)',
                            background: 'var(--tone)',
                            backgroundImage: 'radial-gradient(var(--ink) 1.4px,transparent 1.5px)',
                            backgroundSize: 'var(--dot) var(--dot)',
                            flex: 'none',
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.name}
                        </div>
                        {member.role && (
                          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{ROLE_LABEL[member.role]}</div>
                        )}
                      </div>
                      <Link
                        href={`/${member.slug}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          border: '2px solid var(--ink)',
                          borderRadius: 6,
                          padding: '6px 12px',
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          boxSizing: 'border-box',
                          textDecoration: 'none',
                          flex: 'none',
                        }}
                      >
                        Profil
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Role-gate hint sits below the body, referenced by the disabled footer button. */}
            {showGate && !call.hasApplied && !call.viewerHasRole && (
              <p id={hintId} style={{ fontSize: 12, color: 'var(--ink2)', margin: '16px 0 0' }}>
                {roleGateHint(call.seekingRoles)}
              </p>
            )}
          </div>
        )}

        {/* Footer — same Candidater gating as the board card. */}
        {call && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 10,
              padding: '14px 18px',
              borderTop: '3px solid var(--ink)',
              background: 'var(--paper)',
              position: 'sticky',
              bottom: 0,
            }}
          >
            <button type="button" onClick={onClose} style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '9px 18px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)' }}>
              Fermer
            </button>

            {closed ? (
              <span style={closedBadge}>Clôturé</span>
            ) : call.isOwner ? null : call.hasApplied ? (
              <span
                style={{
                  background: 'var(--tone)',
                  color: 'var(--ink2)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '9px 18px',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Candidature envoyée
              </span>
            ) : call.viewerHasRole ? (
              <button
                type="button"
                onClick={() => onCandidater(call)}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '9px 18px',
                  minHeight: 44,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '3px 3px 0 var(--shadow)',
                }}
              >
                Candidater
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-describedby={hintId}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '9px 18px',
                  minHeight: 44,
                  cursor: 'not-allowed',
                  fontFamily: 'inherit',
                  background: 'var(--tone)',
                  color: 'var(--ink2)',
                }}
              >
                Candidater
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
