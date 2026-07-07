'use client';

// MC-5 — "Candidater" application modal. Replica of the prototype CANDIDATER MODAL section
// (.dc.html lines 2780-2798): 500px ink-bordered card + hard offset shadow, header, then in body
// order **VOTRE MESSAGE** (textarea) FIRST, then **JOINDRE UN ÉCHANTILLON** — a single row that
// shows the applicant's portfolio pieces as selectable thumbnails, a file adder, and the verbatim
// "ou lier mon portfolio" text all at once (no mode switch). Footer Annuler / Envoyer ma candidature.
// Keeps the real wiring the static prototype omits: exactly ONE sample source (portfolio item XOR
// uploaded F-10 media), client validation, POST /calls/:id/applications, and success/error states.
// On 201 the parent flips the board card to a disabled "Candidature envoyée" via onApplied(callId).
import { useEffect, useRef, useState } from 'react';
import {
  APPLICATION_MESSAGE_MAX,
  type ApiError,
  type ApplyToCallRequest,
  type CallCard,
  type CallDirection,
  type CreatorRole,
  type MediaResponse,
  type PortfolioItemResponse,
} from '@encre-et-plume/shared';
import { getMe, getProfile, getProfilePortfolio, applyToCall } from '../../lib/api';
import { XIcon } from '../icons';
import UploadControl from '../UploadControl';

// Same focus-trap pattern as InviteModal / PostCallModal.
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

type PortfolioState =
  | { status: 'loading' }
  | { status: 'ready'; items: PortfolioItemResponse[] }
  | { status: 'error' };

// The role a call is looking for (its author's inverse). Drives the apply-as toggle default.
function soughtRole(direction: CallDirection): CreatorRole {
  return direction === 'writerSeeksIllustrator' ? 'dessinateur' : 'scenariste';
}

const ROLE_LABEL: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.02em',
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

const errText: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--accent)',
  fontWeight: 700,
  margin: '8px 0 0',
};

export default function ApplyCallModal({
  call,
  onClose,
  onApplied,
}: {
  call: CallCard;
  onClose: () => void;
  onApplied: (callId: string, applicationId: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'apply-call-title';
  const sampleErrId = 'apply-call-sample-error';

  const [portfolio, setPortfolio] = useState<PortfolioState>({ status: 'loading' });
  // Dual-role applicants pick the role they apply as; single-role users see no toggle (server default).
  const [dualRole, setDualRole] = useState(false);
  const [appliedAs, setAppliedAs] = useState<CreatorRole>(soughtRole(call.direction));
  const [portfolioItemId, setPortfolioItemId] = useState<string | null>(null);
  const [sampleMediaId, setSampleMediaId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [uploadBusy, setUploadBusy] = useState(false);
  const [sampleError, setSampleError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  // Move focus into the dialog on open.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Load the applicant's portfolio pieces for the inline thumbnail picker, and their creator roles
  // (a dual-role applicant gets the apply-as toggle; default = the call's sought role when they have it).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => Promise.all([getProfile(me.slug), getProfilePortfolio(me.slug)]))
      .then(([profile, its]) => {
        if (cancelled) return;
        const roles = profile.creatorRoles ?? [];
        const both = roles.includes('scenariste') && roles.includes('dessinateur');
        setDualRole(both);
        if (both) {
          const sought = soughtRole(call.direction);
          setAppliedAs(roles.includes(sought) ? sought : roles[0]);
        }
        setPortfolio({ status: 'ready', items: its });
      })
      .catch(() => !cancelled && setPortfolio({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [call.direction]);

  // Exactly ONE sample source — the last one chosen wins (picking a thumbnail clears an upload and
  // vice-versa), so the POST body always carries a single field.
  function pickPortfolioItem(id: string) {
    setPortfolioItemId((cur) => (cur === id ? null : id));
    setSampleMediaId(null);
    setSampleError(false);
  }
  function onUploaded(media: MediaResponse) {
    setSampleMediaId(media.id);
    setPortfolioItemId(null);
    setSampleError(false);
  }

  const sampleBody: ApplyToCallRequest | null = sampleMediaId
    ? { sampleMediaId }
    : portfolioItemId
      ? { samplePortfolioItemId: portfolioItemId }
      : null;

  async function handleSubmit() {
    if (pending || uploadBusy) return;
    if (!sampleBody) {
      setSampleError(true);
      return;
    }
    setSampleError(false);
    setServerError(null);
    setPending(true);
    try {
      const created = await applyToCall(call.id, {
        ...sampleBody,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(dualRole ? { appliedAs } : {}),
      });
      setSent(true);
      onApplied(call.id, created.id);
    } catch (err) {
      const apiErr = err as ApiError;
      setServerError(apiErr.message ?? 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setPending(false);
    }
  }

  const items = portfolio.status === 'ready' ? portfolio.items : [];

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
        aria-labelledby={titleId}
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
          width: 500,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        {/* Header (prototype 2783) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              id={titleId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              Candidater
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>
              {call.heading} · {call.title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {sent ? (
          // Success state — body replaced by confirmation.
          <div style={{ padding: '28px 18px' }}>
            <p role="status" style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
              Candidature envoyée !
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {call.authorName} recevra votre candidature pour {call.title}.
            </p>
          </div>
        ) : (
          <div style={{ padding: '16px 18px' }}>
            {/* Apply-as role toggle — only for applicants who hold BOTH creator roles (owner add). */}
            {dualRole && (
              <div role="group" aria-label="Je candidate en tant que :" style={{ marginBottom: 14 }}>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Je candidate en tant que :</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['scenariste', 'dessinateur'] as CreatorRole[]).map((r) => {
                    const active = appliedAs === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setAppliedAs(r)}
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          border: '2px solid var(--ink)',
                          borderRadius: 5,
                          padding: '8px 13px',
                          minHeight: 44,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          background: active ? 'var(--accent)' : 'var(--card)',
                          color: active ? '#fff' : 'var(--ink)',
                        }}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VOTRE MESSAGE — first, per the prototype (2788). */}
            <label htmlFor="apply-call-message" style={{ ...sectionLabel, display: 'block', marginBottom: 6 }}>
              VOTRE MESSAGE
            </label>
            <textarea
              id="apply-call-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={APPLICATION_MESSAGE_MAX}
              placeholder="Présentez-vous, votre style et pourquoi ce projet vous parle…"
              style={{
                width: '100%',
                border: '2px solid var(--ink)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                background: 'var(--card)',
                color: 'var(--ink)',
                minHeight: 88,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />

            {/* JOINDRE UN ÉCHANTILLON — second (2790). Portfolio thumbnails + file adder + link, one row. */}
            <div
              role="group"
              aria-labelledby="apply-call-sample-label"
              aria-describedby={sampleError ? sampleErrId : undefined}
            >
              <div id="apply-call-sample-label" style={{ ...sectionLabel, margin: '14px 0 8px' }}>
                JOINDRE UN ÉCHANTILLON
              </div>

              {items.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  {items.map((item, i) => {
                    const selected = portfolioItemId === item.id;
                    const alt = item.caption ?? `Échantillon ${i + 1}`;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => pickPortfolioItem(item.id)}
                        style={{
                          padding: 0,
                          width: 60,
                          height: 78,
                          border: `2px solid ${selected ? 'var(--accent)' : 'var(--ink)'}`,
                          borderRadius: 5,
                          cursor: 'pointer',
                          background: 'var(--card)',
                          overflow: 'hidden',
                          boxShadow: selected ? '3px 3px 0 var(--accent)' : 'none',
                          flex: 'none',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={alt}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </button>
                    );
                  })}
                  {/* Verbatim prototype text (2795). The thumbnails to the left ARE the linked portfolio. */}
                  <span style={{ fontSize: 12, color: 'var(--ink2)' }}>
                    ou <b style={{ color: 'var(--accent)' }}>lier mon portfolio</b>
                  </span>
                </div>
              )}

              {/* File adder — reuses the F-10 presigned-upload flow (labelled input, type/size allowlist,
                  progress). Shown inline alongside the thumbnails; no mode switch. */}
              <UploadControl
                kind="application_sample"
                label="Fichier d'échantillon"
                onUploaded={onUploaded}
                onBusyChange={setUploadBusy}
              />

              {sampleError && (
                <p id={sampleErrId} role="alert" style={errText}>
                  Ajoutez un échantillon de votre travail.
                </p>
              )}
            </div>

            {serverError && (
              <p role="alert" style={{ ...errText, marginTop: 12 }}>
                {serverError}
              </p>
            )}
          </div>
        )}

        {/* Footer (prototype 2798) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 18px',
            borderTop: '3px solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          {sent ? (
            <button
              type="button"
              onClick={onClose}
              style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)' }}
            >
              Fermer
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={pending || uploadBusy}
                style={{
                  ...footerBtn,
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '3px 3px 0 var(--shadow)',
                  opacity: pending || uploadBusy ? 0.6 : 1,
                }}
              >
                {pending ? 'Envoi…' : 'Envoyer ma candidature'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
