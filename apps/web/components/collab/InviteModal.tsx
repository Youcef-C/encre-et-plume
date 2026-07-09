'use client';

// MC-3 — "Proposer une collab" invite modal. Replica of the prototype INVITE MODAL section
// (.dc.html lines 2802–2815): 460px ink-bordered card, hard offset shadow, recipient header,
// "CHOISIR UN PROJET" selectable rows, footer Annuler / Envoyer l'invitation — plus the story's
// inferred MESSAGE field. No emojis: the prototype's ✉/✕ glyphs map to icons.tsx.
// Reused by all four prefilled triggers (MC-1 cards, F-3 profile, DR-3 work, DR-6 illustration).
// Round 2 (Mode A multi-recipient): when launched WITHOUT a recipient (from /contacts) the modal
// enters picker mode — an OnBrandMultiSelect over the sender's contacts (Inferred body, plan §7.4).
import { useEffect, useRef, useState } from 'react';
import {
  INVITATION_MESSAGE_MAX,
  type ApiError,
  type ContactItem,
  type CreateInvitationsResponse,
  type InvitationSendStatus,
  type ProjectSummary,
} from '@encre-et-plume/shared';
import { getMyProjects, getContacts, createInvitation } from '../../lib/api';
import OnBrandMultiSelect from '../form/OnBrandMultiSelect';
import { XIcon } from '../icons';

export interface InviteRecipient {
  userId: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string | null; // role · location line, composed by each trigger
}

type ProjectsState =
  | { status: 'loading' }
  | { status: 'ready'; items: ProjectSummary[] }
  | { status: 'error' };

// Same focus-trap pattern as SupprimerCompteModal / CguReconsentModal.
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

// Halftone placeholder disc for a missing avatar (prototype var(--tone) disc).
const avatarDisc = (avatarUrl: string | null): React.CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  flex: 'none',
  background: avatarUrl ? `center/cover url(${avatarUrl})` : 'var(--tone)',
});

// Cover thumb for a project row (prototype halftone rectangles when cover is null).
const coverThumb = (cover: string | null): React.CSSProperties => ({
  width: 36,
  height: 46,
  border: '2px solid var(--ink)',
  borderRadius: 4,
  flex: 'none',
  ...(cover
    ? { background: `center/cover url(${cover})` }
    : {
        backgroundColor: 'var(--accent)',
        backgroundImage:
          'radial-gradient(rgba(22,19,15,.5) 1.3px,transparent 1.4px),linear-gradient(150deg,var(--ink) 42%,var(--accent) 42%)',
        backgroundSize: 'var(--dot) var(--dot),cover',
      }),
});

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  marginBottom: 11,
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

// Per-recipient result labels for the picker success view (plan §F1).
const RESULT_LABEL: Record<InvitationSendStatus, string> = {
  sent: 'Envoyée',
  duplicate: 'Déjà une proposition en attente',
  unavailable: 'Indisponible',
  self: 'Indisponible',
};

export default function InviteModal({
  recipient,
  onClose,
}: {
  recipient?: InviteRecipient;
  onClose: () => void;
}) {
  const picker = !recipient;

  const [projects, setProjects] = useState<ProjectsState>({ status: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A duplicate result is terminal for this recipient — lock the send button (prefilled mode).
  const [locked, setLocked] = useState(false);

  // Picker mode only: contacts pool + selection + per-recipient send results.
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [results, setResults] = useState<CreateInvitationsResponse['results'] | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'invite-modal-title';
  const errorId = 'invite-modal-error';

  useEffect(() => {
    let cancelled = false;
    getMyProjects()
      .then((res) => !cancelled && setProjects({ status: 'ready', items: res.items }))
      .catch(() => !cancelled && setProjects({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    getContacts()
      .then((res) => {
        if (cancelled) return;
        setContacts(res.items);
        setContactsLoaded(true);
      })
      // Load error → treat as empty, the muted hint covers both cases.
      .catch(() => !cancelled && setContactsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [picker]);

  // Move focus into the dialog on open.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    focusTrap(e, dialogRef);
  };

  const toUsers = picker ? selectedContacts : [recipient!.userId];

  async function handleSend() {
    if (sending || locked) return;
    if (picker && selectedContacts.length === 0) {
      setError('Sélectionnez au moins un·e destinataire.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await createInvitation({
        kind: 'direct',
        toUsers,
        ...(projectId ? { projectId } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      if (picker) {
        setResults(res.results);
        return;
      }
      // Prefilled single recipient — one result in the envelope.
      const status = res.results[0]?.status;
      if (status === 'sent') {
        setSent(true);
      } else if (status === 'duplicate') {
        setError('Une proposition est déjà en attente pour ce créateur.');
        setLocked(true);
      } else {
        setError('Ce créateur ne peut pas recevoir de proposition pour le moment.');
      }
    } catch (err) {
      setError((err as ApiError).message ?? 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSending(false);
    }
  }

  // Map recipient id → display name for the picker result list (contacts never include self).
  const nameById = new Map(contacts.map((c) => [c.userId, c.name]));
  const sendLabel = toUsers.length >= 2 ? 'Envoyer les invitations' : "Envoyer l'invitation";

  return (
    <div
      // Overlay — click outside closes (prototype pattern).
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
        onKeyDown={handleKeyDown}
        style={{
          width: 460,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        {/* Header — in prefilled mode this IS the read-only recipient field. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
          }}
        >
          {recipient && <span aria-hidden="true" style={avatarDisc(recipient.avatarUrl)} />}
          <div style={{ minWidth: 0 }}>
            <div
              id={titleId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 19,
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              {recipient ? `Inviter ${recipient.name}` : 'Proposer une collab'}
            </div>
            {recipient?.subtitle && (
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{recipient.subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--ink2)',
              cursor: 'pointer',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {results ? (
          // Picker success — one line per recipient with its send result (plan §F1).
          <div style={{ padding: '22px 18px' }}>
            <ul role="status" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {results.map((r) => (
                <li key={r.toUser} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>{nameById.get(r.toUser) ?? r.toUser}</b>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      border: `2px solid ${r.status === 'sent' ? '#1f8a5b' : 'var(--ink2)'}`,
                      color: r.status === 'sent' ? '#1f8a5b' : 'var(--ink2)',
                      borderRadius: 5,
                      padding: '2px 9px',
                    }}
                  >
                    {RESULT_LABEL[r.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : sent ? (
          // Prefilled success state — body replaced by confirmation.
          <div style={{ padding: '28px 18px' }}>
            <p role="status" style={{ fontSize: 15, fontWeight: 700, margin: 0, lineHeight: 1.5 }}>
              Proposition envoyée à {recipient!.name}.
            </p>
          </div>
        ) : (
          <div style={{ padding: '16px 18px' }}>
            {picker && (
              // Recipient picker (Mode A multi-select) — only when not launched from one person.
              <>
                <div style={sectionLabel} id="invite-recipients-label">
                  DESTINATAIRES
                </div>
                {contactsLoaded && contacts.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 16px', lineHeight: 1.5 }}>
                    Aucun contact pour l&apos;instant — connectez-vous d&apos;abord avec des créateurs.
                  </p>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <OnBrandMultiSelect
                      label="Contacts"
                      options={contacts.map((c) => ({ value: c.userId, label: c.name }))}
                      values={selectedContacts}
                      onChange={setSelectedContacts}
                      searchable
                    />
                  </div>
                )}
              </>
            )}

            {/* Project picker (CHOISIR UN PROJET). ＋ Créer un nouveau projet omitted — CS-1 seam. */}
            <div style={sectionLabel} id="invite-project-label">
              CHOISIR UN PROJET
            </div>

            {projects.status === 'loading' && (
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 14px' }}>Chargement…</p>
            )}

            {projects.status === 'error' && (
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 14px' }}>
                Impossible de charger vos projets — vous pouvez envoyer la proposition sans projet joint.
              </p>
            )}

            {projects.status === 'ready' && projects.items.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Aucun projet pour l&apos;instant — vous pouvez envoyer la proposition sans projet joint.
              </p>
            )}

            {projects.status === 'ready' && projects.items.length > 0 && (
              <div
                role="radiogroup"
                aria-labelledby="invite-project-label"
                style={{ marginBottom: 14 }}
              >
                {projects.items.map((project) => {
                  const selected = projectId === project.id;
                  return (
                    <div
                      key={project.id}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setProjectId((cur) => (cur === project.id ? null : project.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setProjectId((cur) => (cur === project.id ? null : project.id));
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        border: `2px solid ${selected ? 'var(--accent)' : 'var(--ink)'}`,
                        borderRadius: 8,
                        padding: '10px 12px',
                        marginBottom: 9,
                        cursor: 'pointer',
                        background: selected ? 'var(--accent-soft)' : 'var(--card)',
                      }}
                    >
                      <span aria-hidden="true" style={coverThumb(project.cover)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 14 }}>{project.title}</b>
                        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{project.meta}</div>
                      </div>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: '2px solid var(--ink)',
                          flex: 'none',
                          background: selected ? 'var(--accent)' : 'var(--card)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 10,
                        }}
                      >
                        {selected ? '●' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Message (inferred, story-required). */}
            <label htmlFor="invite-message" style={{ ...sectionLabel, display: 'block', marginTop: 4 }}>
              MESSAGE
            </label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={INVITATION_MESSAGE_MAX}
              placeholder={picker ? 'Écrivez un mot aux destinataires…' : 'Écrivez un mot à ce créateur…'}
              rows={3}
              style={{
                width: '100%',
                border: '2px solid var(--ink)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                background: 'var(--card)',
                color: 'var(--ink)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              aria-describedby={error ? errorId : undefined}
            />

            {error && (
              <p
                id={errorId}
                role="alert"
                style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '10px 0 0' }}
              >
                {error}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
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
          {sent || results ? (
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
                onClick={() => void handleSend()}
                disabled={sending || locked}
                style={{
                  ...footerBtn,
                  background: 'var(--accent)',
                  color: '#fff',
                  boxShadow: '3px 3px 0 var(--shadow)',
                  opacity: sending || locked ? 0.6 : 1,
                }}
              >
                {sending ? 'Envoi…' : sendLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
