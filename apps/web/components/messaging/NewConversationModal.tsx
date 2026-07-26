'use client';

// MC-9 FE-4 / MC-13 + contacts-DM follow-up 5b — "Nouvelle conversation": ONE on-brand modal behind
// the widget header's single start-a-conversation button. Pick people with the shared reachable-user
// search (contacts first, never a native select); picked people show as removable chips.
//   · exactly 1 person  → a DM   (openDm → POST /conversations { participantId } — dmPolicy F-19 and
//                                 the block rules MC-10 are decided server-side, as everywhere else)
//   · 2 or more people  → a group (POST /conversations { participantIds }), with an OPTIONAL name
//                                 (settable later from "Gérer le groupe").
// Focus-trap/Esc as InviteModal.
import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import {
  GROUP_NAME_MAX_LENGTH,
  type ReachableUser,
  type ConversationItem,
} from '@encre-et-plume/shared';
import { createConversation } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { useMessaging } from '../../lib/messaging';
import ReachableUserSearch from './ReachableUserSearch';
import { XIcon } from '../icons';

function focusTrap(e: React.KeyboardEvent, ref: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !ref.current) return;
  const focusable = Array.from(
    ref.current.querySelectorAll<HTMLElement>(
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

export default function NewConversationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversation: ConversationItem) => void;
}) {
  const { openDm } = useMessaging();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ReachableUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'new-conversation-title';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const isGroup = selected.length > 1;

  function addParticipant(u: ReachableUser) {
    setSelected((cur) => (cur.some((s) => s.id === u.id) ? cur : [...cur, u]));
  }
  function removeParticipant(id: string) {
    setSelected((cur) => cur.filter((s) => s.id !== id));
  }

  async function handleSubmit() {
    if (submitting) return;
    const first = selected[0];
    if (!first) {
      setError('Ajoutez au moins une personne.');
      return;
    }
    setError(null);
    setSubmitting(true);

    // 1 person → the shared DM path, so a refused dmPolicy / a block behaves exactly as it does from
    // /contacts, a profile or the salon roster: the server's French copy comes back and is shown here.
    if (!isGroup) {
      const refusal = await openDm(first.id);
      if (refusal) {
        setError(refusal);
        setSubmitting(false);
        return;
      }
      onClose();
      return;
    }

    const trimmed = name.trim();
    try {
      const conv = await createConversation({
        ...(trimmed ? { name: trimmed } : {}), // the name is optional — settable later
        participantIds: selected.map((s) => s.id),
      });
      onCreated(conv);
    } catch (err) {
      setError(apiErrorMessage(err));
      setSubmitting(false);
    }
  }

  const submitLabel = isGroup ? 'Créer le groupe' : 'Démarrer la conversation';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(22,19,15,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
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
        style={{ width: 420, maxWidth: '100%', maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '7px 7px 0 var(--shadow)' }}
      >
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '15px 18px', borderBottom: '3px solid var(--ink)' }}>
          <div id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 19, textTransform: 'uppercase', lineHeight: 1 }}>
            Nouvelle conversation
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>
              Avec qui&nbsp;?
            </div>
            <ReachableUserSearch
              label="Ajouter une personne"
              excludeIds={selected.map((s) => s.id)}
              onPick={addParticipant}
            />
            <p style={{ margin: '6px 2px 0', fontSize: 11, color: 'var(--ink2)', lineHeight: 1.45 }}>
              Une personne&nbsp;: conversation privée. Plusieurs&nbsp;: un groupe.
            </p>
            {selected.length > 0 && (
              <ul aria-label="Personnes sélectionnées" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {selected.map((s) => (
                  <li
                    key={s.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 999, padding: '4px 6px 4px 12px', background: 'var(--paper)', minHeight: 36 }}
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => removeParticipant(s.id)}
                      aria-label={`Retirer ${s.name}`}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28, border: 'none', background: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                    >
                      <XIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The name only exists for a group, and even there it is optional (follow-up 5b). */}
          {isGroup && (
            <div>
              <label htmlFor="group-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>
                Nom du groupe (facultatif)
              </label>
              <input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={GROUP_NAME_MAX_LENGTH}
                placeholder="Projet · …"
                style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '6px 2px 0', fontSize: 11, color: 'var(--ink2)', lineHeight: 1.45 }}>
                Sans nom, le groupe prend celui de ses membres. Vous pourrez le renommer plus tard.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
          <button type="button" onClick={onClose} className="ep-btn-secondary" style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', padding: '9px 18px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="ep-btn-primary"
            style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', padding: '9px 18px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Un instant…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
