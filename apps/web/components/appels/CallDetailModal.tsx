'use client';

// MC-4X — "Voir le détail" modal. Induced addition (no drawn prototype frame): replicates the
// established PostCallModal/ApplyCallModal shell (overlay, 3px ink border, radius 12,
// 7px 7px 0 shadow, header + XIcon "Fermer", focus trap, Esc/overlay close, role=dialog). Fetches
// GET /calls/:id and shows the FULL call: description, all sample images, PDF document links,
// author/meta/chips/deadline/applicant count, and the same gated Candidater as the board card.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CREATOR_ROLES, type CallCard, type CallDetail, type ApiError } from '@encre-et-plume/shared';
import { getCallDetail, deleteCall, closeCall } from '../../lib/api';
import { roleGateHint, ROLE_LABEL } from '../../lib/calls';
import { formatBytes } from '../../lib/format';
import { XIcon } from '../icons';
import PostCallModal from './PostCallModal';

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

// F3-4 contrast: ink (not ink2) — kills the washed 11px labels; AA in both themes.
const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink)',
  letterSpacing: '.03em',
  margin: '18px 0 8px',
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--paper)',
  border: '2px solid var(--ink)', // F3-4: bold-border rule (was the app's only 1.5px outlier)
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

const footerBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 18px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; call: CallDetail }
  | { status: 'error' };

export default function CallDetailModal({
  callId,
  onClose,
  onCandidater,
  onChanged,
  onDeleted,
}: {
  callId: string;
  onClose: () => void;
  onCandidater: (call: CallDetail) => void;
  // Round 3 (F3-3): owner edit/delete ripples for the host page (selector/board refetch). No-op defaults.
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'call-detail-title';
  const hintId = 'call-detail-role-hint';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // MC-4 amendment: end-a-call-early confirm/pending/error, separate from delete.
  const [closeConfirming, setCloseConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCall(callId);
      onDeleted?.();
      onClose();
    } catch (err) {
      setDeleting(false);
      setDeleteError((err as ApiError).message ?? 'Suppression impossible.');
    }
  }

  // MC-4 amendment: PATCH { status: 'closed' } — keeps accepted collaborators, stops new applications.
  // On success reflect the closed state in-place (refetch) and ripple to the host page.
  async function handleCloseCall() {
    setClosing(true);
    setCloseError(null);
    try {
      await closeCall(callId);
      setCloseConfirming(false);
      setClosing(false);
      setReloadKey((k) => k + 1);
      onChanged?.();
    } catch (err) {
      setClosing(false);
      setCloseError((err as ApiError).message ?? 'Clôture impossible.');
    }
  }

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
    <>
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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--ink)' }}>
            Détail de l&apos;appel
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
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
                        Document {i + 1} (PDF · {formatBytes(doc.size)})
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
            {confirming ? (
              // Round 3 (F3-3): inline on-brand delete confirm — MC-6 pattern, no window.confirm.
              <div
                role="group"
                aria-label="Confirmer la suppression de l'appel"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, width: '100%' }}
              >
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Supprimer cet appel et ses candidatures ?</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '2px 2px 0 var(--shadow)', opacity: deleting ? 0.6 : 1 }}
                  >
                    Confirmer la suppression
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                    style={{ ...footerBtn, background: 'var(--card)' }}
                  >
                    Annuler
                  </button>
                </span>
                {deleteError && (
                  <span role="alert" style={{ width: '100%', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                    {deleteError}
                  </span>
                )}
              </div>
            ) : closeConfirming ? (
              // MC-4 amendment: inline on-brand close-early confirm (same pattern as delete).
              <div
                role="group"
                aria-label="Confirmer la clôture de l'appel"
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, width: '100%' }}
              >
                <span style={{ fontSize: 13, color: 'var(--ink2)' }}>Clôturer cet appel ? Les collaborateurs acceptés sont conservés.</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void handleCloseCall()}
                    disabled={closing}
                    style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '2px 2px 0 var(--shadow)', opacity: closing ? 0.6 : 1 }}
                  >
                    {closing ? 'Clôture…' : 'Confirmer la clôture'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCloseConfirming(false);
                      setCloseError(null);
                    }}
                    disabled={closing}
                    style={{ ...footerBtn, background: 'var(--card)' }}
                  >
                    Annuler
                  </button>
                </span>
                {closeError && (
                  <span role="alert" style={{ width: '100%', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                    {closeError}
                  </span>
                )}
              </div>
            ) : (
              <>
                <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
                  Fermer
                </button>

                {call.isOwner ? (
                  // Owner controls (D12): Éditer only on open calls; Supprimer always (destructive outline).
                  <>
                    {closed && <span style={closedBadge}>Clôturé</span>}
                    {!closed && (
                      <button type="button" onClick={() => setEditing(true)} style={{ ...footerBtn, background: 'var(--card)' }}>
                        Éditer
                      </button>
                    )}
                    {/* MC-4 amendment: end the call early — open calls only (distinct from delete). */}
                    {!closed && (
                      <button
                        type="button"
                        onClick={() => {
                          setCloseError(null);
                          setCloseConfirming(true);
                        }}
                        style={{ ...footerBtn, background: 'var(--card)' }}
                      >
                        Clôturer l&apos;appel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirming(true);
                      }}
                      style={{ ...footerBtn, background: 'var(--card)', border: '2px solid var(--accent)', color: 'var(--accent)' }}
                    >
                      Supprimer
                    </button>
                  </>
                ) : closed ? (
                  <span style={closedBadge}>Clôturé</span>
                ) : call.hasApplied ? (
                  <span
                    style={{
                      background: 'var(--tone)',
                      color: 'var(--ink)', // F3-4: ink (was ink2 — the real AA fail)
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
                    style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)' }}
                  >
                    Candidater
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    aria-describedby={hintId}
                    style={{ ...footerBtn, cursor: 'not-allowed', background: 'var(--tone)', color: 'var(--ink)' }}
                  >
                    Candidater
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>

      {/* Round 3: owner edit — the shared form in pre-filled edit mode; own overlay stacks above. */}
      {editing && call && (
        <PostCallModal
          onClose={() => setEditing(false)}
          onCreated={() => {}}
          edit={{ callId, initial: call }}
          onUpdated={() => {
            setEditing(false);
            setReloadKey((k) => k + 1);
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
