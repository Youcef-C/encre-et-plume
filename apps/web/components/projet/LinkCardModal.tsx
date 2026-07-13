'use client';

// CS-3 F5 — "Lier à une carte" picker. Lists the project's kanban cards ([[CS-2]] pages); selecting
// one calls POST /assets/:id/link. Re-link replaces server-side (one card max per asset). Proto modal
// chrome (3px ink border, radius 12, hard offset shadow, ✕ close), Escape-dismissible, focus-trapped.
import { useEffect, useRef, useState } from 'react';
import type { AssetItem, PageStage, WorkspacePage } from '@encre-et-plume/shared';
import { linkAssetToPage } from '../../lib/api';
import { XIcon } from '../icons';

// Small stage label map (mirrors KanbanBoard's private STAGE_META — only the label is needed here).
const STAGE_LABEL: Record<PageStage, string> = {
  scenario: 'Scénario',
  nemu: 'Nemu',
  corrections: 'Corrections',
  propre: 'Propre',
  encrage: 'Encrage',
  valide: 'Validé',
};

export interface LinkCardModalProps {
  asset: AssetItem;
  pages: WorkspacePage[];
  onClose: () => void;
  onLinked: (updated: AssetItem) => void;
}

export default function LinkCardModal({ asset, pages, onClose, onLinked }: LinkCardModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useRef(`link-card-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function pick(pageId: string) {
    setBusyId(pageId);
    setError(null);
    try {
      const updated = await linkAssetToPage(asset.id, { pageId });
      onLinked(updated);
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null;
      setError(msg ?? 'Échec de la liaison. Réessayez.');
      setBusyId(null);
    }
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={overlay}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        style={panel}
      >
        <div style={header}>
          <div id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase' }}>
            Lier à une carte
          </div>
          <button ref={closeRef} type="button" aria-label="Fermer" onClick={onClose} style={closeBtn}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginBottom: 12 }}>
            {asset.filename}
            {asset.linkedPage && (
              <> · actuellement liée à <b style={{ color: 'var(--ink)' }}>{asset.linkedPage.title}</b></>
            )}
          </div>
          {error && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginBottom: 10 }}>
              {error}
            </div>
          )}
          {pages.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Aucune carte dans ce projet.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pages.map((p) => {
                const current = asset.linkedPage?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p.id)}
                      disabled={busyId !== null}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'left',
                        border: '2px solid var(--ink)',
                        borderRadius: 8,
                        background: current ? 'var(--accent-soft)' : 'var(--card)',
                        color: 'var(--ink)',
                        fontFamily: 'inherit',
                        padding: '10px 12px',
                        cursor: busyId ? 'default' : 'pointer',
                        minHeight: 44,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{p.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
                        {STAGE_LABEL[p.stage] ?? p.stage}
                      </span>
                      {current && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>✓ liée</span>}
                      {busyId === p.id && <span style={{ fontSize: 12, color: 'var(--ink2)' }}>…</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 90,
  background: 'rgba(22,19,15,.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const panel: React.CSSProperties = {
  width: 460,
  maxWidth: '100%',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  boxShadow: '7px 7px 0 var(--shadow)',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '15px 18px',
  borderBottom: '3px solid var(--ink)',
};

const closeBtn: React.CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink2)',
  cursor: 'pointer',
  display: 'inline-flex',
  padding: 4,
};
