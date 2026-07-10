'use client';

// CS-2 TABLEAU — the production kanban. Replica of prototype data-projview="tableau"
// (chapter chip row + 6 production columns + page cards). Native HTML5 drag & drop (no dep);
// optimistic stage moves revert on error. The "⋯" card menu is the keyboard path for moving cards.
import { useId, useRef, useState } from 'react';
import {
  PAGE_STAGES,
  type PageStage,
  type PageFileTag,
  type WorkspaceChapter,
  type WorkspacePage,
  type PageVersionItem,
} from '@encre-et-plume/shared';
import {
  PenNibIcon,
  BrushIcon,
  EyeIcon,
  ImageIcon,
  FileTextIcon,
} from '../icons';
import { createPage, deletePage, updatePageStage, getPageVersions } from '../../lib/api';

// Column metadata — labels, the ✒/🖌 icon substitutions, and the accent columns (Corrections, VALIDÉ).
const STAGE_META: Record<
  PageStage,
  { label: string; icon?: 'pen' | 'brush'; accent?: boolean; check?: boolean }
> = {
  scenario: { label: 'Scénario', icon: 'pen' },
  nemu: { label: 'Nemu' },
  corrections: { label: 'Corrections', accent: true },
  propre: { label: 'PROPRE' },
  encrage: { label: 'Encrage', icon: 'brush' },
  valide: { label: 'VALIDÉ', accent: true, check: true },
};

const FILE_TAG_META: Record<PageFileTag, { label: string; icon?: 'doc' | 'img'; accent?: boolean }> =
  {
    scenario: { label: 'scénario', icon: 'doc' },
    ref: { label: 'réf', icon: 'img' },
    nemu: { label: 'nemu', icon: 'img' },
    double: { label: 'Double', accent: true },
  };

function chapterChipLabel(c: WorkspaceChapter): string {
  return c.number === 0 ? 'Prologue' : `Ch. ${c.number}`;
}

export interface KanbanBoardProps {
  slug: string;
  chapters: WorkspaceChapter[];
  initialPages: WorkspacePage[];
  readOnly?: boolean;
}

export default function KanbanBoard({ slug, chapters, initialPages, readOnly }: KanbanBoardProps) {
  const [pages, setPages] = useState<WorkspacePage[]>(initialPages);
  // null = "Toutes" / unassigned view is implicit; we default to the first chapter when one exists.
  const [selectedChapter, setSelectedChapter] = useState<string | null>(
    chapters[0]?.id ?? null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PageStage | null>(null);
  const [error, setError] = useState(false);

  const scopedPages = pages.filter((p) =>
    selectedChapter === null ? p.chapterId === null : p.chapterId === selectedChapter,
  );

  async function moveCard(id: string, stage: PageStage) {
    const prev = pages;
    const current = pages.find((p) => p.id === id);
    if (!current || current.stage === stage) return;
    setError(false);
    // Optimistic — reflect immediately, revert on failure.
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, stage } : p)));
    try {
      const updated = await updatePageStage(id, stage);
      setPages((ps) => ps.map((p) => (p.id === id ? updated : p)));
    } catch {
      setPages(prev);
      setError(true);
    }
  }

  async function addCard(stage: PageStage) {
    try {
      const created = await createPage(slug, { chapterId: selectedChapter, stage });
      setPages((ps) => [...ps, created]);
    } catch {
      setError(true);
    }
  }

  async function removeCard(id: string) {
    const prev = pages;
    setPages((ps) => ps.filter((p) => p.id !== id));
    try {
      await deletePage(id);
    } catch {
      setPages(prev);
      setError(true);
    }
  }

  const selectedLabel = (() => {
    if (selectedChapter === null) return 'Cartes non classées';
    const c = chapters.find((ch) => ch.id === selectedChapter);
    if (!c) return '—';
    return `${chapterChipLabel(c)}${c.title ? ` — ${c.title}` : ''}`;
  })();

  return (
    <div>
      {/* Chapter chip row (proto 1333–1344) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '11px 18px',
          borderBottom: '2px solid var(--border)',
          fontSize: 13,
          fontWeight: 700,
          flexWrap: 'wrap',
          background: 'var(--paper)',
        }}
      >
        <span style={{ color: 'var(--ink2)' }}>Chapitre :</span>
        {chapters.map((c) => {
          const active = c.id === selectedChapter;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedChapter(c.id)}
              aria-pressed={active}
              style={{
                border: '2px solid var(--ink)',
                borderRadius: 5,
                padding: '4px 11px',
                cursor: 'pointer',
                minHeight: 30,
                fontWeight: 700,
                fontSize: 13,
                fontFamily: 'inherit',
                background: active ? 'var(--accent)' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink)',
              }}
            >
              {chapterChipLabel(c)}
            </button>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            aria-label="Ajouter un chapitre"
            title="Ajouter un chapitre (bientôt)"
            style={{
              border: '2px dashed var(--ink)',
              borderRadius: 5,
              padding: '4px 10px',
              cursor: 'pointer',
              minHeight: 30,
              background: 'var(--card)',
              color: 'var(--ink)',
              fontFamily: 'inherit',
            }}
          >
            ＋
          </button>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--ink2)', fontWeight: 500 }}>
          Sélection : <b>{selectedLabel}</b>
        </span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            margin: '12px 18px 0',
            border: '2px solid var(--accent)',
            borderRadius: 8,
            background: 'var(--accent-soft)',
            color: 'var(--ink)',
            padding: '9px 13px',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Le changement d&apos;étape a échoué. Réessayez.
        </div>
      )}

      {/* 6 production columns (proto 1345–1352). Horizontally scrollable below desktop. */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '16px 18px',
          overflowX: 'auto',
        }}
      >
        {PAGE_STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            cards={scopedPages.filter((p) => p.stage === stage)}
            readOnly={readOnly}
            isDropTarget={dropStage === stage}
            dragId={dragId}
            onDragStartCard={setDragId}
            onDragEndCard={() => {
              setDragId(null);
              setDropStage(null);
            }}
            onDropTargetEnter={() => setDropStage(stage)}
            onDropTargetLeave={() => setDropStage((s) => (s === stage ? null : s))}
            onDropCard={(id) => {
              setDropStage(null);
              // The optimistic move unmounts the dragged node, so `dragend` may
              // never fire — clear the fade here where the drop actually lands.
              setDragId(null);
              void moveCard(id, stage);
            }}
            onAddCard={() => void addCard(stage)}
            onMoveCard={(id, to) => void moveCard(id, to)}
            onRemoveCard={(id) => void removeCard(id)}
          />
        ))}
      </div>
    </div>
  );
}

function StageLabel({ stage }: { stage: PageStage }) {
  const meta = STAGE_META[stage];
  return (
    <>
      {meta.label}
      {meta.icon === 'pen' && <PenNibIcon size={13} style={{ marginLeft: 5, display: 'inline' }} />}
      {meta.icon === 'brush' && <BrushIcon size={13} style={{ marginLeft: 5, display: 'inline' }} />}
      {meta.check && <span aria-hidden="true"> ✓</span>}
    </>
  );
}

function Column({
  stage,
  cards,
  readOnly,
  isDropTarget,
  dragId,
  onDragStartCard,
  onDragEndCard,
  onDropTargetEnter,
  onDropTargetLeave,
  onDropCard,
  onAddCard,
  onMoveCard,
  onRemoveCard,
}: {
  stage: PageStage;
  cards: WorkspacePage[];
  readOnly?: boolean;
  isDropTarget: boolean;
  dragId: string | null;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  onDropTargetEnter: () => void;
  onDropTargetLeave: () => void;
  onDropCard: (id: string) => void;
  onAddCard: () => void;
  onMoveCard: (id: string, to: PageStage) => void;
  onRemoveCard: (id: string) => void;
}) {
  const headingId = useId();
  const meta = STAGE_META[stage];

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      onDragOver={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              onDropTargetEnter();
            }
      }
      onDragLeave={readOnly ? undefined : onDropTargetLeave}
      onDrop={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain') || dragId;
              if (id) onDropCard(id);
            }
      }
      style={{
        flex: '1 0 220px',
        minWidth: 220,
        borderRadius: 6,
        padding: isDropTarget ? 4 : 0,
        background: isDropTarget ? 'var(--accent-soft)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div
        id={headingId}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          textTransform: 'uppercase',
          color: meta.accent ? 'var(--accent)' : 'var(--ink2)',
          marginBottom: 9,
          letterSpacing: '.04em',
        }}
      >
        <StageLabel stage={stage} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {cards.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic', padding: '4px 2px' }}>
            Aucune carte
          </div>
        )}
        {cards.map((card) => (
          <PageCard
            key={card.id}
            card={card}
            readOnly={readOnly}
            dragging={dragId === card.id}
            onDragStart={() => onDragStartCard(card.id)}
            onDragEnd={onDragEndCard}
            onMove={(to) => onMoveCard(card.id, to)}
            onRemove={() => onRemoveCard(card.id)}
          />
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={onAddCard}
            style={{
              border: '2px dashed var(--ink)',
              borderRadius: 6,
              padding: '8px',
              fontSize: 12,
              fontWeight: 700,
              textAlign: 'center',
              color: 'var(--ink2)',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'inherit',
              minHeight: 40,
            }}
          >
            ＋ Ajouter une carte
          </button>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 26,
  height: 22,
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  fontSize: 11,
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  padding: 0,
};

function PageCard({
  card,
  readOnly,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
}: {
  card: WorkspacePage;
  readOnly?: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: PageStage) => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [versions, setVersions] = useState<PageVersionItem[] | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function openVersions() {
    setVersionsOpen((v) => !v);
    if (versions === null) {
      try {
        setVersions(await getPageVersions(card.id));
      } catch {
        setVersions([]);
      }
    }
  }

  return (
    <div
      draggable={!readOnly}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
              e.dataTransfer.setData('text/plain', card.id);
              e.dataTransfer.effectAllowed = 'move';
              onDragStart();
            }
      }
      onDragEnd={readOnly ? undefined : onDragEnd}
      style={{
        border: '2px solid var(--ink)',
        borderRadius: 6,
        padding: 8,
        background: 'var(--card)',
        boxShadow: '2px 2px 0 var(--shadow)',
        opacity: dragging ? 0.5 : 1,
        cursor: readOnly ? 'default' : 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
        <b>{card.title}</b>
        <button
          type="button"
          onClick={openVersions}
          title="Versions"
          aria-label={`Versions de ${card.title}`}
          style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: 'none',
            borderRadius: 4,
            padding: '1px 6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ⎘ v{card.version}
        </button>
      </div>

      {versionsOpen && (
        <ul
          style={{
            listStyle: 'none',
            margin: '7px 0 0',
            padding: 7,
            border: '1.5px solid var(--ink)',
            borderRadius: 5,
            background: 'var(--paper)',
            fontSize: 11,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {versions === null && <li style={{ color: 'var(--ink2)' }}>Chargement…</li>}
          {versions?.length === 0 && <li style={{ color: 'var(--ink2)' }}>Aucune version</li>}
          {versions?.map((v) => (
            <li key={v.version}>
              <b>v{v.version}</b>
              {v.note ? ` · ${v.note}` : ''}
            </li>
          ))}
        </ul>
      )}

      {card.fileTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {card.fileTags.map((tag) => {
            const tm = FILE_TAG_META[tag];
            return (
              <span
                key={tag}
                title={tm.accent ? 'Double page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 9,
                  fontWeight: 700,
                  border: '1.5px solid var(--ink)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  background: tm.accent ? 'var(--accent)' : 'transparent',
                  color: tm.accent ? '#fff' : 'var(--ink)',
                }}
              >
                {tm.icon === 'doc' && <FileTextIcon size={10} style={{ display: 'inline' }} />}
                {tm.icon === 'img' && <ImageIcon size={10} style={{ display: 'inline' }} />}
                {tm.accent && <span aria-hidden="true">⇿ </span>}
                {tm.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Action row — ✎/👁/⚑ are CS-4/CS-5 placeholders (no-op); ⋯ opens the real move+delete menu. */}
      <div style={{ display: 'flex', gap: 4, marginTop: 7, position: 'relative' }}>
        <button type="button" title="Éditer" aria-label="Éditer" disabled={readOnly} style={iconBtnStyle}>
          <span aria-hidden="true">✎</span>
        </button>
        <button type="button" title="Aperçu" aria-label="Aperçu" style={iconBtnStyle}>
          <EyeIcon size={12} />
        </button>
        <button
          type="button"
          title="Corrections"
          aria-label="Corrections"
          disabled={readOnly}
          style={iconBtnStyle}
        >
          <span aria-hidden="true">⚑</span>
        </button>
        {!readOnly && (
          <button
            type="button"
            title="Menu"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((o) => !o);
              setConfirmDelete(false);
            }}
            style={{ ...iconBtnStyle, marginLeft: 'auto' }}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        )}

        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false);
            }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 20,
              minWidth: 180,
              border: '2px solid var(--ink)',
              borderRadius: 8,
              background: 'var(--card)',
              boxShadow: '4px 4px 0 var(--shadow)',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--ink2)',
                padding: '2px 6px',
              }}
            >
              Déplacer vers →
            </div>
            {PAGE_STAGES.filter((s) => s !== card.stage).map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => {
                  onMove(s);
                  setMenuOpen(false);
                }}
                style={menuItemStyle}
              >
                {STAGE_META[s].label}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 4px' }}>
                <span style={{ fontSize: 11, color: 'var(--ink2)' }}>Supprimer ?</span>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    setMenuOpen(false);
                  }}
                  style={{ ...menuItemStyle, color: '#c0392b', width: 'auto', flex: 1 }}
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{ ...menuItemStyle, width: 'auto', flex: 1 }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirmDelete(true)}
                style={{ ...menuItemStyle, color: '#c0392b' }}
              >
                Supprimer la carte
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  borderRadius: 5,
  padding: '5px 6px',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
};
