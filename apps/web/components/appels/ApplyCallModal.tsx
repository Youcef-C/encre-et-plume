'use client';

// MC-5 / MC-4X — "Candidater" application modal. Replica of the prototype CANDIDATER MODAL section
// (.dc.html lines 2780-2798): 500px ink-bordered card + hard offset shadow, header, then in body
// order **VOTRE MESSAGE** (textarea) FIRST, then **JOINDRE UN ÉCHANTILLON** — the applicant's
// portfolio pieces as selectable thumbnails, image/PDF file adders, and the verbatim "ou lier mon
// portfolio" text. MC-4X: up to 3 MIXED samples (portfolio picks + uploaded images + uploaded PDFs),
// at least 1 required, counter "n/3", POST body carries `samples[]`. The "Je candidate en tant que :"
// toggle is GONE — the server derives appliedAs from the call's seekingRole (which the gate proves the
// applicant holds). On 201 the parent flips the board card to "Candidature envoyée" via onApplied.
import { useEffect, useRef, useState } from 'react';
import {
  APPLICATION_MESSAGE_MAX,
  APPLICATION_MAX_SAMPLES,
  type ApiError,
  type ApplicationSample,
  type ApplicationSampleRef,
  type ApplyToCallRequest,
  type CallCard,
  type CreatorRole,
  type EditApplicationRequest,
  type MediaResponse,
  type MediaVariants,
  type PortfolioItemResponse,
} from '@encre-et-plume/shared';
import { getMe, getProfile, getProfilePortfolio, applyToCall, updateMyApplication } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/calls';
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

// One chosen sample (up to APPLICATION_MAX_SAMPLES, mixed sources). `id` is the portfolioItemId
// (portfolio) or the mediaId (image/document); `key` gives uploads a stable React key.
type Picked =
  | { source: 'portfolio'; id: string; thumb: string; alt: string }
  | { source: 'image'; id: string; thumb: string }
  | { source: 'document'; id: string; name: string };

function toRef(p: Picked): ApplicationSampleRef {
  return p.source === 'portfolio' ? { portfolioItemId: p.id } : { mediaId: p.id };
}

// MC-6 #7: pre-fill edit mode from the detail's samples (each now carries its ref) so existing pieces
// re-submit as refs without re-uploading. Exactly one of portfolioItemId / mediaId is set.
function sampleToPicked(s: ApplicationSample, i: number): Picked {
  if (s.portfolioItemId) return { source: 'portfolio', id: s.portfolioItemId, thumb: s.url, alt: `Échantillon ${i + 1}` };
  return s.kind === 'document'
    ? { source: 'document', id: s.mediaId as string, name: 'Document' }
    : { source: 'image', id: s.mediaId as string, thumb: s.url };
}

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
  edit,
  onClose,
  onApplied,
}: {
  call: CallCard;
  // MC-6 amendment: when set, the modal edits a PENDING application (PATCH /me/applications/:id) instead
  // of creating one — pre-fills the message + existing samples and saves via updateMyApplication.
  // Role/appliedAs is immutable. `initialSamples` are the detail's samples (ref-carrying, MC-6 #7).
  edit?: { applicationId: string; initialMessage: string; initialSamples: ApplicationSample[] };
  onClose: () => void;
  onApplied: (callId: string, applicationId: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'apply-call-title';
  const sampleErrId = 'apply-call-sample-error';
  const isEdit = edit != null;

  const [portfolio, setPortfolio] = useState<PortfolioState>({ status: 'loading' });
  const [samples, setSamples] = useState<Picked[]>(() => edit?.initialSamples.map(sampleToPicked) ?? []);
  const [message, setMessage] = useState(edit?.initialMessage ?? '');
  // req6: when the call seeks >1 role the applicant also holds, they pick which role they apply as.
  const [chooserRoles, setChooserRoles] = useState<CreatorRole[]>([]);
  const [appliedAs, setAppliedAs] = useState<CreatorRole | null>(null);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [sampleError, setSampleError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  // Move focus into the dialog on open.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Load the applicant's portfolio pieces for the inline thumbnail picker, plus their creator roles —
  // needed only to decide whether to show the "j'applique en tant que" chooser (multi-role calls).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => Promise.all([getProfile(me.slug), getProfilePortfolio(me.slug)]))
      .then(([profile, its]) => {
        if (cancelled) return;
        const roles = profile.creatorRoles ?? [];
        const intersection = call.seekingRoles.filter((r) => roles.includes(r));
        if (intersection.length > 1) {
          setChooserRoles(intersection);
          setAppliedAs(intersection[0]);
        }
        setPortfolio({ status: 'ready', items: its });
      })
      .catch(() => !cancelled && setPortfolio({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [call.seekingRoles]);

  const atMax = samples.length >= APPLICATION_MAX_SAMPLES;
  const uploads = samples.filter((s) => s.source !== 'portfolio');

  function isPortfolioPicked(id: string) {
    return samples.some((s) => s.source === 'portfolio' && s.id === id);
  }

  function togglePortfolio(item: PortfolioItemResponse, alt: string) {
    setSampleError(false);
    setSamples((cur) => {
      const idx = cur.findIndex((s) => s.source === 'portfolio' && s.id === item.id);
      if (idx >= 0) return cur.filter((_, i) => i !== idx);
      if (cur.length >= APPLICATION_MAX_SAMPLES) return cur;
      return [...cur, { source: 'portfolio', id: item.id, thumb: item.image, alt }];
    });
  }

  // ONE combined box: images land as application_sample, PDF/text as application_document — routed
  // by the returned media.kind. Both count toward the same 3-sample cap.
  function onUploaded(media: MediaResponse, filename?: string) {
    setSampleError(false);
    setSamples((cur) => {
      if (cur.length >= APPLICATION_MAX_SAMPLES) return cur;
      return media.kind === 'application_document'
        ? [...cur, { source: 'document', id: media.id, name: filename ?? 'Document' }]
        : [...cur, { source: 'image', id: media.id, thumb: (media.variants as MediaVariants).thumb }];
    });
  }

  function removeUpload(mediaId: string) {
    setSamples((cur) => cur.filter((s) => !(s.source !== 'portfolio' && s.id === mediaId)));
  }

  async function handleSubmit() {
    // Mirror the submit button's enabled condition: at max samples the UploadControl unmounts and its
    // onBusyChange(false) never fires, leaving uploadBusy stuck true — so ignore uploadBusy when atMax.
    if (pending || (uploadBusy && !atMax)) return;
    if (samples.length === 0) {
      setSampleError(true);
      return;
    }
    setSampleError(false);
    setServerError(null);
    setPending(true);
    try {
      if (isEdit) {
        // MC-6 amendment: PATCH the caller's pending application — message + samples only (no appliedAs).
        const body: EditApplicationRequest = {
          samples: samples.map(toRef),
          ...(message.trim() ? { message: message.trim() } : {}),
        };
        const updated = await updateMyApplication(edit.applicationId, body);
        setSent(true);
        onApplied(updated.callId, edit.applicationId);
      } else {
        const body: ApplyToCallRequest = {
          samples: samples.map(toRef),
          ...(message.trim() ? { message: message.trim() } : {}),
          // Only sent when the chooser is shown (multi-role intersection); otherwise the server derives it.
          ...(chooserRoles.length > 1 && appliedAs ? { appliedAs } : {}),
        };
        const created = await applyToCall(call.id, body);
        setSent(true);
        onApplied(call.id, created.id);
      }
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
              {isEdit ? 'Modifier ma candidature' : 'Candidater'}
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
              {isEdit ? 'Candidature modifiée !' : 'Candidature envoyée !'}
            </p>
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '8px 0 0', lineHeight: 1.5 }}>
              {isEdit
                ? `Vos modifications pour ${call.title} ont été enregistrées.`
                : `${call.authorName} recevra votre candidature pour ${call.title}.`}
            </p>
          </div>
        ) : (
          <div style={{ padding: '16px 18px' }}>
            {/* req6: role chooser — only when the call seeks >1 role the applicant holds. Hidden in edit
               mode (appliedAs is immutable via PATCH /me/applications/:id). */}
            {!isEdit && chooserRoles.length > 1 && (
              <div role="group" aria-label="Je candidate en tant que :" style={{ marginBottom: 14 }}>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Je candidate en tant que :</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {chooserRoles.map((r) => {
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

            {/* JOINDRE UN ÉCHANTILLON — second (2790). Up to 3 mixed samples with a live counter. */}
            <div
              role="group"
              aria-labelledby="apply-call-sample-label"
              aria-describedby={sampleError ? sampleErrId : undefined}
            >
              <div
                id="apply-call-sample-label"
                style={{ ...sectionLabel, margin: '14px 0 8px', display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}
              >
                <span>JOINDRE UN ÉCHANTILLON</span>
                <span style={{ color: 'var(--accent)' }}>{samples.length}/{APPLICATION_MAX_SAMPLES}</span>
              </div>

              {items.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                  {items.map((item, i) => {
                    const selected = isPortfolioPicked(item.id);
                    const alt = item.caption ?? `Échantillon ${i + 1}`;
                    const disabled = !selected && atMax;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        onClick={() => togglePortfolio(item, alt)}
                        style={{
                          padding: 0,
                          width: 60,
                          height: 78,
                          border: `2px solid ${selected ? 'var(--accent)' : 'var(--ink)'}`,
                          borderRadius: 5,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          background: 'var(--card)',
                          overflow: 'hidden',
                          boxShadow: selected ? '3px 3px 0 var(--accent)' : 'none',
                          opacity: disabled ? 0.45 : 1,
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

              {/* Removable list of the uploaded (non-portfolio) samples — image thumbs + PDF chips. */}
              {uploads.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {uploads.map((s) => (
                    <li
                      key={s.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: '2px solid var(--ink)',
                        borderRadius: 6,
                        padding: s.source === 'image' ? 4 : '6px 10px',
                        background: 'var(--card)',
                      }}
                    >
                      {s.source === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumb} alt="Échantillon téléversé" width={40} height={52} style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ✓ {s.name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeUpload(s.id)}
                        aria-label="Retirer cet échantillon"
                        style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
                      >
                        <XIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ONE combined file adder — image, PDF or text. Remounted after each success (key on
                  the count) so a fresh idle control appears. Hidden once 3 samples are chosen. */}
              {atMax ? (
                <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0 }}>Maximum {APPLICATION_MAX_SAMPLES} échantillons.</p>
              ) : (
                <UploadControl
                  key={samples.length}
                  kind="application_sample"
                  documentKind="application_document"
                  label="Ajouter un échantillon"
                  onUploaded={onUploaded}
                  onBusyChange={setUploadBusy}
                />
              )}

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
                // MC-5 amendment: reaching MAX must NOT block submit. At MAX the UploadControl unmounts,
                // so a lingering uploadBusy can never clear — ignore it once the cap is reached (only
                // the "add more" affordance is gated by atMax). ≥1 sample is enforced in handleSubmit.
                disabled={pending || (uploadBusy && !atMax)}
                style={{
                  ...footerBtn,
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '3px 3px 0 var(--shadow)',
                  opacity: pending || (uploadBusy && !atMax) ? 0.6 : 1,
                }}
              >
                {isEdit
                  ? pending
                    ? 'Enregistrement…'
                    : 'Enregistrer'
                  : pending
                    ? 'Envoi…'
                    : 'Envoyer ma candidature'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
