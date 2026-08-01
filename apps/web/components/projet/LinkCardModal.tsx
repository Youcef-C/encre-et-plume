'use client';

// CS-3 F5 — "Lier à une carte" picker. Lists the project's kanban cards ([[CS-2]] pages); each row is
// a link/unlink TOGGLE and the modal stays open, so an asset can be linked to several cards in a row.
// Clicking an unlinked card → POST /assets/:id/link; clicking a linked one → DELETE …/link?pageId=.
// MULTI types (scenario/texte/ref) toggle any number of cards on; SINGLE types (dessin/page) replace
// their single link server-side (the previously-linked row toggles off from the returned linkedPages).
// Proto modal chrome (3px ink border, radius 12, hard offset shadow, icon close), Escape-dismissible.
import { useEffect, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import type { AssetItem, AssetType, PageStage, WorkspacePage } from '@encre-et-plume/shared';
import { MULTI_LINK_ASSET_TYPES } from '@encre-et-plume/shared';
import { linkAssetToPage, unlinkAssetFromPage } from '../../lib/api';
import OnBrandSelect from '../form/OnBrandSelect';
import { XIcon, CheckIcon } from '../icons';

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
  /**
   * R5-6a — `chapterId → label` (« Prologue », « Ch. 2 »), resolved ONCE by FichiersPanel from the
   * workspace chapters. Chapter-scoped auto-numbering lets two cards both read « Page 3 », so the
   * row has to name the chapter; the label format lives in `chapterChipLabel`, not here.
   */
  chapterLabels: Map<string, string>;
  onClose: () => void;
  onLinked: (updated: AssetItem) => void;
}

export default function LinkCardModal({ asset, pages, chapterLabels, onClose, onLinked }: LinkCardModalProps) {
  useScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Working copy so row selection + the header note reflect each toggle without a reload; the server
  // returns the authoritative linkedPages every time (add/replace/drop), which we also bubble up.
  const [current, setCurrent] = useState<AssetItem>(asset);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useRef(`link-card-${Math.random().toString(36).slice(2)}`).current;

  // R7-1 — search + chapter filter, the FichiersPanel idiom (debounced text, OnBrandSelect,
  // auto-apply, reset). Purely CLIENT-side: `pages` is already the whole project, so there is
  // nothing to fetch. Filter state is never touched by `toggle`, so it survives multi-linking.
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const hasFilters = search.trim() !== '' || chapterFilter !== '';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  function resetFilters() {
    setSearch('');
    setDebouncedQ('');
    setChapterFilter('');
  }

  const visible = pages.filter(
    (p) =>
      (!chapterFilter || p.chapterId === chapterFilter) &&
      (!debouncedQ || p.title.toLowerCase().includes(debouncedQ)),
  );

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function toggle(pageId: string, isLinked: boolean) {
    setBusyId(pageId);
    setError(null);
    try {
      const updated = isLinked
        ? await unlinkAssetFromPage(current.id, pageId)
        : await linkAssetToPage(current.id, { pageId });
      setCurrent(updated);
      onLinked(updated);
      setBusyId(null);
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

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginBottom: 12 }}>
            {current.filename}
            {current.linkedPages.length > 0 && (
              <> · actuellement liée à{' '}
                <b style={{ color: 'var(--ink)' }}>{current.linkedPages.map((p) => p.title).join(' · ')}</b>
              </>
            )}
            {(MULTI_LINK_ASSET_TYPES as readonly AssetType[]).includes(current.type) ? (
              <div style={{ marginTop: 4 }}>Un scénario/une référence peut être liée à plusieurs cartes.</div>
            ) : (
              <div style={{ marginTop: 4 }}>Cliquez une carte pour lier/délier ce fichier.</div>
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
            <>
              <div style={filterBar}>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une carte…"
                  aria-label="Rechercher une carte"
                  style={searchInput}
                />
                {chapterLabels.size > 0 && (
                  <div style={{ flex: '1 1 150px', minWidth: 140 }}>
                    <OnBrandSelect
                      aria-label="Filtrer par chapitre"
                      value={chapterFilter}
                      onChange={(e) => setChapterFilter(e.target.value)}
                    >
                      <option value="">Tous les chapitres</option>
                      {[...chapterLabels].map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </OnBrandSelect>
                  </div>
                )}
                {hasFilters && (
                  <button type="button" onClick={resetFilters} className="ep-btn-secondary" style={resetBtn}>
                    Réinitialiser
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                // Distinct from "no cards at all" above: here the project HAS cards, the filters hide them.
                <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Aucune carte ne correspond.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visible.map((p) => {
                    const isLinked = current.linkedPages.some((lp) => lp.id === p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={isLinked}
                          onClick={() => toggle(p.id, isLinked)}
                          disabled={busyId !== null}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            textAlign: 'left',
                            border: `2px solid ${isLinked ? 'var(--accent)' : 'var(--ink)'}`,
                            borderRadius: 8,
                            background: isLinked ? 'var(--accent-soft)' : 'var(--card)',
                            color: 'var(--ink)',
                            fontFamily: 'inherit',
                            padding: '10px 12px',
                            cursor: busyId ? 'default' : 'pointer',
                            minHeight: 44,
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{p.title}</span>
                          {chapterLabels.get(p.chapterId ?? '') && (
                            <span style={chapterChip}>{chapterLabels.get(p.chapterId ?? '')}</span>
                          )}
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
                            {STAGE_LABEL[p.stage] ?? p.stage}
                          </span>
                          {busyId === p.id ? (
                            <span style={{ fontSize: 12, color: 'var(--ink2)' }}>…</span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: isLinked ? 'var(--accent)' : 'var(--ink2)' }}>
                              {isLinked ? (
                                <>
                                  <CheckIcon size={12} />
                                  liée
                                </>
                              ) : (
                                '＋ lier'
                              )}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div style={footer}>
          <button type="button" onClick={onClose} className="ep-btn-primary" style={doneBtn}>
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

// R7-1 — same geometry as the FichiersPanel filter bar, narrowed to the 460px modal (wraps at 375px).
const filterBar: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBottom: 12,
};

const searchInput: React.CSSProperties = {
  flex: '1 1 160px',
  minWidth: 140,
  minHeight: 44,
  boxSizing: 'border-box',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
};

const resetBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
};

// The on-brand chip idiom already used across the studio (2px ink border, radius 4, tiny bold text).
const chapterChip: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 4,
  padding: '1px 6px',
  background: 'var(--paper)',
  color: 'var(--ink)',
  whiteSpace: 'nowrap',
};

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
  maxHeight: '88vh',
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

const footer: React.CSSProperties = {
  flex: 'none',
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '12px 18px',
  borderTop: '3px solid var(--ink)',
};

const doneBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 18px',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--shadow)',
  fontFamily: 'inherit',
  minHeight: 44,
};
