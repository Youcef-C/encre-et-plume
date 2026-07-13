'use client';

// MC-9 FE-4 / MC-13 — "Nouveau groupe": on-brand modal to create a group conversation. Name field +
// the shared reachable-user search (contacts OR anyone reachable, never a native select); picked
// people show as removable chips. Direct add — a non-contact can be added straight in. Submit →
// POST /conversations { name, participantIds } → opens the new thread. Focus-trap/Esc as InviteModal.
import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import {
  GROUP_NAME_MAX_LENGTH,
  type ApiError,
  type ReachableUser,
  type ConversationItem,
} from '@encre-et-plume/shared';
import { createConversation } from '../../lib/api';
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

export default function GroupCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversation: ConversationItem) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<ReachableUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'group-modal-title';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function addParticipant(u: ReachableUser) {
    setSelected((cur) => (cur.some((s) => s.id === u.id) ? cur : [...cur, u]));
  }
  function removeParticipant(id: string) {
    setSelected((cur) => cur.filter((s) => s.id !== id));
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!name.trim()) {
      setError('Le nom est requis.');
      return;
    }
    if (selected.length === 0) {
      setError('Ajoutez au moins un·e participant·e.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const conv = await createConversation({ name: name.trim(), participantIds: selected.map((s) => s.id) });
      onCreated(conv);
    } catch (err) {
      setError((err as ApiError).message ?? 'Une erreur est survenue. Veuillez réessayer.');
      setSubmitting(false);
    }
  }

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
            Nouveau groupe
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="group-name" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>
              Nom du groupe
            </label>
            <input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={GROUP_NAME_MAX_LENGTH}
              placeholder="Projet · …"
              style={{ width: '100%', border: '2px solid var(--ink)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Participant·e·s</div>
            <ReachableUserSearch
              label="Ajouter un·e participant·e"
              excludeIds={selected.map((s) => s.id)}
              onPick={addParticipant}
            />
            {selected.length > 0 && (
              <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
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

          {error && (
            <p role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: 0 }}>
              {error}
            </p>
          )}
        </div>

        <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
          <button type="button" onClick={onClose} style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '9px 18px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            style={{ fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '9px 18px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Création…' : 'Créer le groupe'}
          </button>
        </div>
      </div>
    </div>
  );
}
