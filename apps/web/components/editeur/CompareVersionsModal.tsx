'use client';

// CS-5 (iter 5) Item 1 — "Comparer les versions" side-by-side modal for the editor. Two scenario
// versions rendered on the A4 sheet (VersionSheet) at A4 ratio, sourced from the review endpoint.
//
// SECURITY INVARIANT (see VersionSheet): both HTMLs come from api.getReview → selected.fromHtml /
// toHtml, which the server passes through sanitizeScenarioHtml. NEVER pass raw editor.getHTML() here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AssetVersionItem } from '@encre-et-plume/shared';
import { useScrollLock } from '../../lib/useScrollLock';
import * as api from '../../lib/api';
import OnBrandSelect from '../form/OnBrandSelect';
import VersionSheet from './VersionSheet';
import { annotateCompare } from './version-compare';
import { XIcon } from '../icons';

export interface CompareVersionsModalProps {
  pageId: string;
  assetId: string;
  /** Available versions (head-first not required — we sort). Only `version`/`note` are read. */
  versions: Pick<AssetVersionItem, 'version' | 'note'>[];
  headVersion: number;
  onClose: () => void;
}

type Pane = { html: string | null };

export default function CompareVersionsModal({ pageId, assetId, versions, headVersion, onClose }: CompareVersionsModalProps) {
  useScrollLock();
  // Default compare: N-1 ↔ N (the two most recent versions).
  const [from, setFrom] = useState(() => Math.max(1, headVersion - 1));
  const [to, setTo] = useState(headVersion);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [panes, setPanes] = useState<{ from: Pane; to: Pane } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Synchronised scrolling — both panes track the same scroll offset so lines line up. `syncing` guards
  // the echo (setting B.scrollTop fires B's onScroll, which must not write back to A).
  const leftScroll = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const mirror = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (!src || !dst || syncing.current) return;
    syncing.current = true;
    dst.scrollTop = src.scrollTop;
    dst.scrollLeft = src.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };
  const titleId = useRef(`compare-${Math.random().toString(36).slice(2)}`).current;

  const opts = [...versions]
    .map((v) => v.version)
    .sort((a, b) => b - a);
  // Fallback so the pickers always have at least the head + default pair even before versions load.
  const versionList = opts.length > 0 ? opts : Array.from(new Set([headVersion, Math.max(1, headVersion - 1)])).sort((a, b) => b - a);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    setState('loading');
    api
      .getReview(pageId, { file: assetId, from, to })
      .then((p) => {
        if (!alive) return;
        setPanes({ from: { html: p.selected?.fromHtml ?? null }, to: { html: p.selected?.toHtml ?? null } });
        setState('ready');
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [pageId, assetId, from, to]);

  // C8 — annotate both sanitized HTMLs with the diff (added/removed blocks + word-level runs). Only
  // when both panes have HTML; otherwise the raw single HTML is shown (unavailable note handles null).
  const annotated = useMemo(() => {
    const f = panes?.from.html ?? null;
    const t = panes?.to.html ?? null;
    if (f == null || t == null) return null;
    return annotateCompare(f, t);
  }, [panes]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={overlay}>
      <div
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
            Comparer les versions
          </div>
          <button ref={closeRef} type="button" aria-label="Fermer" onClick={onClose} style={closeBtn}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={pickers}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <OnBrandSelect aria-label="Version à gauche" value={String(from)} onChange={(e) => setFrom(Number(e.target.value))}>
              {versionList.map((v) => (
                <option key={v} value={String(v)}>{`v${v}`}</option>
              ))}
            </OnBrandSelect>
          </div>
          <span aria-hidden="true" style={{ fontSize: 18, color: 'var(--ink2)', fontWeight: 700 }}>
            ↔
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <OnBrandSelect aria-label="Version à droite" value={String(to)} onChange={(e) => setTo(Number(e.target.value))}>
              {versionList.map((v) => (
                <option key={v} value={String(v)}>{`v${v}`}</option>
              ))}
            </OnBrandSelect>
          </div>
        </div>

        <div className="ep-compare-panes" style={body}>
          {state === 'error' ? (
            <div style={{ padding: 24, fontSize: 14, color: 'var(--ink2)' }}>Impossible de charger les versions.</div>
          ) : (
            <>
              <ComparePane
                scrollRef={leftScroll}
                onScroll={() => mirror(leftScroll.current, rightScroll.current)}
                loading={state === 'loading'}
                html={annotated?.from ?? panes?.from.html ?? null}
              />
              <ComparePane
                scrollRef={rightScroll}
                onScroll={() => mirror(rightScroll.current, leftScroll.current)}
                loading={state === 'loading'}
                html={annotated?.to ?? panes?.to.html ?? null}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ComparePane({
  loading,
  html,
  scrollRef,
  onScroll,
}: {
  loading: boolean;
  html: string | null;
  scrollRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}) {
  return (
    <div className="ep-compare-pane" style={pane}>
      <div ref={scrollRef} onScroll={onScroll} style={paneScroll}>
        {loading ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--ink2)' }}>Chargement de la version…</div>
        ) : html == null ? (
          <div style={{ padding: 20, fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>
            Aperçu indisponible pour cette version.
          </div>
        ) : (
          <VersionSheet html={html} className="ep-compare-sheet" />
        )}
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
  width: 1100,
  maxWidth: '100%',
  maxHeight: '92vh',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  boxShadow: '7px 7px 0 var(--shadow)',
  overflow: 'hidden',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
};

const header: React.CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '15px 18px',
  borderBottom: '3px solid var(--ink)',
};

const pickers: React.CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 18px',
  borderBottom: '3px solid var(--ink)',
  background: 'var(--paper)',
};

// Comparator layout — a plain white page split by a single centre bar (no per-pane card/shadow).
const body: React.CSSProperties = {
  flex: '1 1 auto',
  display: 'flex',
  gap: 0,
  padding: 0,
  overflow: 'auto',
  minHeight: 0,
  background: 'var(--card)',
};

const pane: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--card)',
  overflow: 'hidden',
};

const paneScroll: React.CSSProperties = {
  flex: '1 1 auto',
  overflow: 'auto',
  padding: 14,
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
