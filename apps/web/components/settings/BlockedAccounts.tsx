'use client';

// MC-10 — "Comptes bloqués" settings list. Reads the caller's own /me/blocks; each row shows the
// account (name → profile), a kind badge (Bloqué / Masqué), the date it was added, and an unblock
// action ("Débloquer" for block, "Ne plus masquer" for mute). States: loading / empty / load-error
// (retry) / per-row unblock spinner + error. Rows wrap so name/date/action stack cleanly at 375px.
import { useState } from 'react';
import Link from 'next/link';
import type { BlockItem } from '@encre-et-plume/shared';
import { getMyBlocks, deleteBlock } from '../../lib/api';
import { useFetchState, useOverride } from '../../lib/useFetchState';

type State = 'loading' | 'ready' | 'error';

const avatarStyle = (url: string | null): React.CSSProperties => ({
  width: 44,
  height: 44,
  flex: 'none',
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  background: url
    ? `center/cover url(${url})`
    : 'var(--tone) radial-gradient(var(--ink) 1.4px, transparent 1.5px) 0 0 / 5px 5px',
});

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  border: '2px solid var(--accent)',
  color: 'var(--accent)',
  borderRadius: 5,
  padding: '1px 8px',
};

function Row({ item, onUnblocked }: { item: BlockItem; onUnblocked: (userId: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const actionLabel = item.kind === 'mute' ? 'Ne plus masquer' : 'Débloquer';

  async function unblock() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await deleteBlock(item.userId, item.kind);
      onUnblocked(item.userId);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        border: '2px solid var(--ink)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--card)',
      }}
    >
      <span aria-hidden="true" style={avatarStyle(item.avatarUrl)} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/${item.slug}`} style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', textDecoration: 'none' }}>
            {item.name}
          </Link>
          <span style={badgeStyle}>{item.kind === 'mute' ? 'Masqué' : 'Bloqué'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>
          Depuis le {new Date(item.createdAt).toLocaleDateString('fr-FR')}
        </div>
        {error && (
          <p role="alert" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, margin: '6px 0 0' }}>
            Impossible de débloquer ce compte. Réessayez.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void unblock()}
        disabled={pending}
        aria-label={`${actionLabel} ${item.name}`}
        className="ep-btn-secondary"
        style={{ fontSize: 12, padding: '8px 14px', minHeight: 44, border: '2px solid var(--ink)', marginLeft: 'auto', opacity: pending ? 0.6 : 1 }}
      >
        {pending ? '…' : actionLabel}
      </button>
    </li>
  );
}

const NO_BLOCKS: BlockItem[] = [];

export default function BlockedAccounts() {
  // DR-14: the shared hook owns the load; the local unblock edit layers on top.
  const feed = useFetchState(getMyBlocks, []);
  const state: State = feed.state;
  const [items, setItems] = useOverride<BlockItem[]>(feed.data?.items ?? NO_BLOCKS);

  if (state === 'loading') {
    return (
      <ul role="status" aria-label="Chargement des comptes bloqués…" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[0, 1].map((i) => (
          <li key={i} aria-hidden="true" className="ep-skeleton-delayed" style={{ height: 68, border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--tone)', opacity: 0.5 }} />
        ))}
      </ul>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert">
        <p style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 0 12px' }}>
          Impossible de charger vos comptes bloqués.
        </p>
        <button
          type="button"
          onClick={feed.retry}
          className="ep-btn-primary"
          style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--ink2)', margin: 0 }}>Aucun compte bloqué.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item) => (
        <Row key={`${item.userId}-${item.kind}`} item={item} onUnblocked={(id) => setItems((prev) => prev.filter((b) => !(b.userId === id && b.kind === item.kind)))} />
      ))}
    </ul>
  );
}
