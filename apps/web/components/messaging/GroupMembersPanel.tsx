'use client';

// MC-12 — "Gérer le groupe" members panel for a STANDALONE group (conv.projectId === null).
// Inferred screen composed from the MC-9 widget tokens + the prototype's member-row / "＋ Ajouter"
// patterns. Swaps the thread body inside the same widget frame (list→thread navigation pattern):
// a back button returns to the conversation. Shows the participant list (avatar + profile link);
// the creator (conv.createdBy === myId) additionally gets "Ajouter" (searchable contacts select)
// and "Retirer" per other member; every member gets "Quitter le groupe". Add/kick/leave are
// optimistic in the provider (rollback on error) and surface a role="alert" inline error here.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ContactItem, ConversationItem } from '@encre-et-plume/shared';
import { getContacts } from '../../lib/api';
import { useMessaging } from '../../lib/messaging';
import OnBrandSelect from '../form/OnBrandSelect';
import { ChevronLeftIcon } from '../icons';

const ERROR_TEXT = 'Une erreur est survenue. Veuillez réessayer.';

function avatarDisc(url: string | null): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    display: 'block',
    background: url ? `center/cover url(${url})` : 'var(--tone)',
  };
}

// ─── focus-trapped confirm dialog (reuses the GroupCreateModal / BlockConfirmModal pattern) ──────
function ConfirmDialog({
  titleId,
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  titleId: string;
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(
      ref.current.querySelectorAll<HTMLElement>('button:not([disabled])'),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(22,19,15,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{ width: 320, maxWidth: '100%', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '6px 6px 0 var(--shadow)', overflow: 'hidden' }}
      >
        <div id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 17, textTransform: 'uppercase', lineHeight: 1, padding: '15px 16px 0' }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 700, margin: 0, padding: '10px 16px 16px' }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '2px solid var(--border)', background: 'var(--paper)' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 14px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}
          >
            Annuler
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 14px', minHeight: 44, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', boxShadow: '2px 2px 0 var(--shadow)', opacity: busy ? 0.6 : 1 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type Confirm =
  | { kind: 'kick'; userId: string; name: string }
  | { kind: 'leave' };

export default function GroupMembersPanel({
  conv,
  myId,
  onBack,
}: {
  conv: ConversationItem;
  myId: string | null;
  onBack: () => void;
}) {
  const { addParticipant, removeParticipant, leaveGroup } = useMessaging();
  const isCreator = conv.createdBy != null && conv.createdBy === myId;

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState('');
  const [busy, setBusy] = useState<null | 'add' | 'leave' | string>(null); // string = kicking that userId
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Contacts for "Ajouter" (creator only). Reuses the MC-8 source, same as GroupCreateModal.
  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    getContacts()
      .then((res) => !cancelled && setContacts(res.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCreator]);

  const memberIds = useMemo(() => new Set(conv.participants.map((p) => p.userId)), [conv.participants]);
  const addOptions = useMemo(() => contacts.filter((c) => !memberIds.has(c.userId)), [contacts, memberIds]);

  async function handleAdd() {
    const contact = addOptions.find((c) => c.userId === selectedToAdd);
    if (!contact || busy) return;
    setError(null);
    setBusy('add');
    try {
      await addParticipant(conv.id, {
        userId: contact.userId,
        slug: contact.slug,
        name: contact.name,
        avatarUrl: contact.avatarUrl,
      });
      setSelectedToAdd('');
    } catch {
      setError(ERROR_TEXT);
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setError(null);
    if (confirm.kind === 'kick') {
      const { userId } = confirm;
      setBusy(userId);
      try {
        await removeParticipant(conv.id, userId);
        setConfirm(null);
      } catch {
        setError(ERROR_TEXT);
        setConfirm(null);
      } finally {
        setBusy(null);
      }
    } else {
      setBusy('leave');
      try {
        await leaveGroup(conv.id);
        // On success the conversation is gone → the widget re-renders to the list; this unmounts.
      } catch {
        setError(ERROR_TEXT);
        setConfirm(null);
        setBusy(null);
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(460px, 60dvh)' }}>
      {/* Panel header — back to the conversation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderBottom: '2px solid var(--border)', background: 'var(--paper)' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour à la conversation"
          style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--ink2)', display: 'inline-flex', padding: 4 }}
        >
          <ChevronLeftIcon size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 13, color: 'var(--ink)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.name}</b>
          <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{conv.participants.length} membres</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--card)' }}>
        {error && (
          <p role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', margin: 0, padding: '10px 13px' }}>
            {error}
          </p>
        )}

        {/* Ajouter — creator only */}
        {isCreator && (
          <div style={{ padding: '12px 13px', borderBottom: '2px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>Ajouter un membre</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <OnBrandSelect
                  value={selectedToAdd}
                  onChange={(e) => setSelectedToAdd(e.target.value)}
                  aria-label="Ajouter un membre"
                  searchable
                  searchPlaceholder="Rechercher un contact…"
                >
                  <option value="">Choisir un contact…</option>
                  {addOptions.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.name}
                    </option>
                  ))}
                </OnBrandSelect>
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!selectedToAdd || busy === 'add'}
                style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '0 14px', minHeight: 44, cursor: !selectedToAdd || busy === 'add' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', boxShadow: '2px 2px 0 var(--shadow)', opacity: !selectedToAdd || busy === 'add' ? 0.55 : 1, whiteSpace: 'nowrap' }}
              >
                {busy === 'add' ? 'Ajout…' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}

        {/* Member rows */}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {conv.participants.map((p) => {
            const canKick = isCreator && p.userId !== conv.createdBy;
            const kicking = busy === p.userId;
            return (
              <li
                key={p.userId}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px', borderBottom: '2px solid var(--border)', minHeight: 44 }}
              >
                <Link
                  href={`/${p.slug}`}
                  aria-label={`Voir le profil de ${p.name}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, textDecoration: 'none', color: 'var(--ink)' }}
                >
                  <span aria-hidden="true" style={avatarDisc(p.avatarUrl)} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                    {p.userId === conv.createdBy && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginLeft: 6 }}>· Créateur·rice</span>
                    )}
                  </span>
                </Link>
                {canKick && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: 'kick', userId: p.userId, name: p.name })}
                    disabled={kicking}
                    aria-label={`Retirer ${p.name} du groupe`}
                    style={{ fontSize: 12, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 12px', minHeight: 44, cursor: kicking ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', opacity: kicking ? 0.55 : 1, whiteSpace: 'nowrap' }}
                  >
                    {kicking ? 'Retrait…' : 'Retirer'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Quitter le groupe — every member */}
      <div style={{ padding: '12px 13px', borderTop: '2px solid var(--border)', background: 'var(--paper)' }}>
        <button
          type="button"
          onClick={() => setConfirm({ kind: 'leave' })}
          disabled={busy === 'leave'}
          style={{ width: '100%', fontSize: 13, fontWeight: 700, border: '2px solid var(--accent)', borderRadius: 6, padding: '10px 14px', minHeight: 44, cursor: busy === 'leave' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--accent)', opacity: busy === 'leave' ? 0.55 : 1 }}
        >
          {busy === 'leave' ? 'Départ…' : 'Quitter le groupe'}
        </button>
      </div>

      {confirm?.kind === 'kick' && (
        <ConfirmDialog
          titleId="mc12-kick-title"
          title="Retirer ce membre"
          body={`Retirer ${confirm.name} du groupe ?`}
          confirmLabel={busy === confirm.userId ? 'Retrait…' : 'Retirer'}
          busy={busy === confirm.userId}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      )}
      {confirm?.kind === 'leave' && (
        <ConfirmDialog
          titleId="mc12-leave-title"
          title="Quitter le groupe"
          body={`Quitter le groupe ${conv.name} ?`}
          confirmLabel={busy === 'leave' ? 'Départ…' : 'Quitter'}
          busy={busy === 'leave'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void handleConfirm()}
        />
      )}
    </div>
  );
}
