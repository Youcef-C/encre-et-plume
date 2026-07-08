'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { InvitationDto, InvitationStatus, CreatorRole } from '@encre-et-plume/shared';
import { listInvitations, respondInvitation } from '../../lib/api';
import { relativeTime } from '../../lib/notifications';
import { BrushIcon, PenNibIcon, MailIcon } from '../icons';

// Inviter's craft -> the complementary craft they invite the recipient to do.
const CRAFT_VERB: Record<CreatorRole, string> = {
  scenariste: 'dessiner', // a writer needs an illustrator
  dessinateur: 'écrire', // an illustrator needs a writer
};
const RoleIcon = { scenariste: PenNibIcon, dessinateur: BrushIcon };

const STATUS_FILTERS: { key: InvitationStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'pending', label: 'En attente' },
  { key: 'accepted', label: 'Acceptées' },
  { key: 'declined', label: 'Refusées' },
];

// Collapse messages longer than this behind "Voir le message complet".
const MESSAGE_CLAMP = 140;

function HalftoneAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: 42,
        height: 42,
        flex: 'none',
        borderRadius: '50%',
        border: '2px solid var(--ink)',
        backgroundColor: 'var(--tone)',
        backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
        backgroundSize: '5px 5px',
      }}
      title={name}
    />
  );
}

function StatusBadge({ status }: { status: InvitationStatus }) {
  if (status === 'accepted') {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          background: '#1f8a5b',
          color: '#fff',
          border: '2px solid var(--ink)',
          borderRadius: 5,
          padding: '3px 10px',
          whiteSpace: 'nowrap',
        }}
      >
        ✓ Acceptée
      </span>
    );
  }
  if (status === 'declined') {
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          background: 'var(--card)',
          color: 'var(--ink2)',
          border: '2px solid var(--ink2)',
          borderRadius: 5,
          padding: '3px 10px',
          whiteSpace: 'nowrap',
        }}
      >
        ✕ Refusée
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        background: 'var(--card)',
        color: 'var(--accent)',
        border: '2px solid var(--accent)',
        borderRadius: 5,
        padding: '3px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      ● En attente
    </span>
  );
}

function InvitationRow({
  item,
  onRespond,
}: {
  item: InvitationDto;
  onRespond: (id: string, status: 'accepted' | 'declined') => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const verb = item.from.role ? CRAFT_VERB[item.from.role] : 'collaborer';
  const Icon = item.from.role ? RoleIcon[item.from.role] : null;
  const isLong = item.message.length > MESSAGE_CLAMP;
  const isDeclined = item.status === 'declined';

  const metaBits = [
    item.project ? item.project.title : null,
    item.project ? item.project.meta : null,
    relativeTime(item.createdAt),
  ].filter(Boolean);

  async function handle(status: 'accepted' | 'declined') {
    setBusy(true);
    try {
      await onRespond(item.id, status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        padding: 14,
        boxShadow: '4px 4px 0 var(--shadow)',
        opacity: isDeclined ? 0.62 : 1,
        flexWrap: 'wrap',
      }}
    >
      <Link
        href={`/${item.from.slug}`}
        aria-label={`Voir le profil de ${item.from.name}`}
        style={{ textDecoration: 'none', flexShrink: 0 }}
      >
        <HalftoneAvatar name={item.from.name} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Link
            href={`/${item.from.slug}`}
            className="ep-invite-sender"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <b style={{ fontSize: 15 }}>{item.from.name}</b>
          </Link>
          {Icon && (
            <span aria-hidden="true" style={{ color: 'var(--ink2)', display: 'inline-flex' }}>
              <Icon size={14} />
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink2)' }}>vous invite à {verb}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 2 }}>{metaBits.join(' · ')}</div>
        {item.message && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--ink2)',
              lineHeight: 1.4,
              marginTop: 5,
            }}
          >
            « {isLong && !expanded ? `${item.message.slice(0, MESSAGE_CLAMP).trimEnd()}…` : item.message} »
          </div>
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              cursor: 'pointer',
              marginTop: 4,
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-body)',
            }}
          >
            {expanded ? 'Réduire ▴' : 'Voir le message complet ▾'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={item.status} />
        {item.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => handle('accepted')}
              disabled={busy}
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: '#1f8a5b',
                color: '#fff',
                border: '2px solid var(--ink)',
                borderRadius: 6,
                padding: '8px 12px',
                minHeight: 44,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
                fontFamily: 'var(--font-body)',
              }}
            >
              {busy ? '…' : 'Accepter'}
            </button>
            <button
              type="button"
              onClick={() => handle('declined')}
              disabled={busy}
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#fff',
                border: '2px solid var(--ink)',
                borderRadius: 6,
                padding: '8px 12px',
                minHeight: 44,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.6 : 1,
                fontFamily: 'var(--font-body)',
              }}
            >
              {busy ? '…' : 'Refuser'}
            </button>
          </>
        )}
        {item.status === 'accepted' && item.project && (
          // ponytail: no per-project workspace route yet (CS-1 owns it) — send "Ouvrir" to the
          // existing project-space surface, same convention as the project_activity notification.
          <Link
            href="/tableau-de-bord"
            style={{
              fontSize: 12,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '8px 12px',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--ink)',
              textDecoration: 'none',
            }}
          >
            Ouvrir
          </Link>
        )}
      </div>
    </li>
  );
}

export default function InvitationsClient() {
  const [items, setItems] = useState<InvitationDto[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<InvitationStatus | 'all'>('all');

  const load = useCallback(() => {
    setError(false);
    listInvitations('received')
      .then((r) => setItems(r.items))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRespond = useCallback(async (id: string, status: 'accepted' | 'declined') => {
    const updated = await respondInvitation(id, status);
    // Optimistic flip — replace the responded row in place, no refetch needed.
    setItems((prev) => prev?.map((n) => (n.id === id ? updated : n)) ?? null);
  }, []);

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      all: all.length,
      pending: all.filter((i) => i.status === 'pending').length,
      accepted: all.filter((i) => i.status === 'accepted').length,
      declined: all.filter((i) => i.status === 'declined').length,
    };
  }, [items]);

  const visible = useMemo(
    () => (filter === 'all' ? items ?? [] : (items ?? []).filter((i) => i.status === filter)),
    [items, filter],
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 28px 80px' }}>
      <Link
        href="/notifications"
        className="ep-back-link"
        style={{
          display: 'inline-block',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink2)',
          marginBottom: 8,
          textDecoration: 'none',
        }}
      >
        ‹ Notifications
      </Link>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
        Invitations
      </h1>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20 }}>
        Toutes les propositions de collaboration reçues.
      </div>

      {/* Status filter chips — auto-apply on click, client-side over the fetched list */}
      <div
        role="group"
        aria-label="Filtrer par statut"
        style={{ display: 'flex', gap: 8, marginBottom: 20, fontSize: 13, fontWeight: 700, flexWrap: 'wrap' }}
      >
        {STATUS_FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              style={{
                background: active ? 'var(--accent)' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink)',
                border: '2px solid var(--ink)',
                borderRadius: 5,
                padding: '6px 12px',
                minHeight: 44,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              {key === 'all' ? `${label} · ${counts.all}` : label}
            </button>
          );
        })}
      </div>

      {items === null && !error ? (
        <div role="status" aria-label="Chargement des invitations" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                height: 96,
                borderRadius: 10,
                border: '3px solid var(--border)',
                background: 'var(--card)',
                animation: 'ep-inv-pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
          <style>{`@keyframes ep-inv-pulse{0%,100%{opacity:.45}50%{opacity:.7}}`}</style>
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            padding: '20px 16px',
            border: '3px solid var(--accent)',
            borderRadius: 10,
            background: 'var(--accent-soft)',
            color: 'var(--ink)',
            fontWeight: 700,
          }}
        >
          Une erreur est survenue. Veuillez réessayer.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink2)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <MailIcon size={32} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Aucune invitation pour le moment.</div>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map((item) => (
            <InvitationRow key={item.id} item={item} onRespond={handleRespond} />
          ))}
        </ul>
      )}
    </div>
  );
}
