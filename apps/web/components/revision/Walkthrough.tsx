'use client';

// CS-25 — New-version triage. A CLIENT MODE over what the review payload already returns: one open
// correction at a time, keyboard-first, each decision the existing `PATCH /corrections/:id` (the same
// handler the list uses). Deliberately NOT a resource: no batch submit, no "review session" entity,
// no draft state — leaving mid-way keeps every decision, because they are already written.
import { useEffect, useRef } from 'react';
import { CORRECTION_STATUS_LABELS, type CorrectionDto, type CorrectionStatus } from '@encre-et-plume/shared';
import { statusColor } from './shared';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from '../icons';

export interface WalkthroughProps {
  /** Snapshot of the corrections to triage, frozen at entry (statuses stay live). */
  items: CorrectionDto[];
  index: number;
  numberOf: (id: string) => number;
  onIndex: (i: number) => void;
  /** The existing status write. Resolves false when the server refused (e.g. 403 « Corrections »). */
  onDecide: (c: CorrectionDto, status: CorrectionStatus) => Promise<boolean>;
  onExit: () => void;
  busy?: boolean;
  error?: string | null;
}

/** key → status. `C` corrigé · `R` toujours à revoir · `E` en cours. */
const KEY_STATUS: Record<string, CorrectionStatus> = { c: 'corrige', r: 'a_corriger', e: 'en_cours' };

const actionStyle = { fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '10px 14px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 7 } as const;
const kbd = { fontFamily: 'var(--font-mono, monospace)', fontSize: 11, border: '1.5px solid currentColor', borderRadius: 4, padding: '0 5px', opacity: 0.85 } as const;

export default function Walkthrough({ items, index, numberOf, onIndex, onDecide, onExit, busy = false, error = null }: WalkthroughProps) {
  const regionRef = useRef<HTMLElement>(null);
  const current: CorrectionDto | undefined = items[index];
  const total = items.length;

  // Focus the mode on entry so the reviewer is inside the labelled region (focus returns to the entry
  // button on exit — handled by the owner, ReviewClient).
  useEffect(() => {
    regionRef.current?.focus({ preventScroll: true });
  }, []);

  // The shortcuts read the LATEST props through a ref, and subscribe once. A deps-free effect would
  // look equivalent, but React flushes passive effects *after* commit: a keypress landing in that gap
  // ran against the previous index (and its stale `busy`), silently swallowing the decision.
  const latest = useRef({ items, index, onIndex, onDecide, onExit, busy });
  latest.current = { items, index, onIndex, onDecide, onExit, busy };

  const decide = async (status: CorrectionStatus) => {
    const p = latest.current;
    const c = p.items[p.index];
    if (p.busy || !c) return;
    const ok = await p.onDecide(c, status);
    if (!ok) return; // refused → stay put, the alert explains why
    if (p.index >= p.items.length - 1) p.onExit(); // last one decided → the mode closes with the summary
    else p.onIndex(p.index + 1);
  };

  // Keyboard-first: document-level so the shortcuts work wherever focus sits inside the review screen,
  // but never while the reviewer is typing (composer textarea, filters, the file picker).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const p = latest.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        p.onExit();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        p.onIndex(Math.max(0, p.index - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        p.onIndex(Math.min(p.items.length - 1, p.index + 1));
        return;
      }
      const status = KEY_STATUS[e.key.toLowerCase()];
      if (status) {
        e.preventDefault();
        void decide(status);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!current) return null;

  const n = numberOf(current.id);
  // F6 — a correction we can't draw (no region) is still triable: it shows as a plain row.
  const drawable = current.type === 'dessin' && 'region' in current.anchor && !!(current.anchor as { region?: unknown }).region;

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      role="region"
      aria-label="Passage en revue des corrections"
      className="ep-walkthrough"
      style={{ border: '3px solid var(--ink)', borderRadius: 10, background: 'var(--card)', boxShadow: '5px 5px 0 var(--shadow)', padding: 14, marginBottom: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase' }}>Passage en revue</span>
        <span style={{ fontSize: 12, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 5, padding: '3px 10px' }}>{`${index + 1} / ${total}`}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="ep-btn-secondary" style={actionStyle} onClick={onExit}>
          <XIcon size={13} />
          Quitter
          <span aria-hidden="true" style={kbd}>Échap</span>
        </button>
      </div>

      {/* A8 — the progress is announced on entry and re-announced on every advance. */}
      <p role="status" aria-live="polite" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', margin: '8px 0 0' }}>
        {`Correction ${index + 1} sur ${total}`}
      </p>

      <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
        <span
          aria-hidden="true"
          style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: statusColor(current.status), color: '#fff', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 14 }}
        >
          {n}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
            <b>{current.authorName}</b>
            {current.caseRef && <span style={{ color: 'var(--ink2)' }}>{current.caseRef}</span>}
            <span style={{ fontWeight: 700, color: statusColor(current.status) }}>{CORRECTION_STATUS_LABELS[current.status]}</span>
            <span style={{ color: 'var(--ink2)' }}>{`déposée en v${current.filedAgainstVersion}`}</span>
            {!drawable && <span style={{ color: 'var(--ink2)', fontStyle: 'italic' }}>Zone non affichable</span>}
          </div>
          <p style={{ fontSize: 14, margin: '4px 0 0' }}>{current.description}</p>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', margin: '10px 0 0' }}>
          {error}
        </p>
      )}

      <div className="ep-walk-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="ep-btn-success" style={actionStyle} disabled={busy} onClick={() => void decide('corrige')} aria-keyshortcuts="c">
          Corrigé
          <span aria-hidden="true" style={kbd}>C</span>
        </button>
        <button type="button" className="ep-btn-secondary" style={actionStyle} disabled={busy} onClick={() => void decide('a_corriger')} aria-keyshortcuts="r">
          Toujours à revoir
          <span aria-hidden="true" style={kbd}>R</span>
        </button>
        <button type="button" className="ep-btn-dark" style={actionStyle} disabled={busy} onClick={() => void decide('en_cours')} aria-keyshortcuts="e">
          En cours
          <span aria-hidden="true" style={kbd}>E</span>
        </button>

        <div style={{ flex: 1 }} />

        <button type="button" className="ep-btn-secondary" style={actionStyle} disabled={index === 0} onClick={() => onIndex(Math.max(0, index - 1))} aria-keyshortcuts="ArrowLeft">
          <ChevronLeftIcon size={13} />
          Précédente
        </button>
        <button type="button" className="ep-btn-secondary" style={actionStyle} disabled={index >= total - 1} onClick={() => onIndex(Math.min(total - 1, index + 1))} aria-keyshortcuts="ArrowRight">
          Suivante
          <ChevronRightIcon size={13} />
        </button>
      </div>
    </section>
  );
}
