'use client';

// CS-2 TABLEAU — the production kanban. Replica of prototype data-projview="tableau"
// (chapter chip row + 6 production columns + page cards). Native HTML5 drag & drop (no dep);
// optimistic stage moves revert on error. The "⋯" card menu is the keyboard path for moving cards.
// CS-2 card-modal extension: whole card opens the CardModal; cards grow Trello-style with label
// bars / due pill / checklist (x/x) / comment count / assignee stack; a label-filter chip row above
// the columns narrows the board (auto-apply, combines with chapters).
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  PAGE_STAGES,
  LABEL_COLORS,
  LABEL_COLOR_NAMES,
  type PageStage,
  type PageFileTag,
  type WorkspaceChapter,
  type WorkspaceMember,
  type WorkspacePage,
  type ProjectLabelItem,
  type AssetType,
} from '@encre-et-plume/shared';
import {
  PenNibIcon,
  BrushIcon,
  EyeIcon,
  ImageIcon,
  FileTextIcon,
  CalendarIcon,
  ChecklistIcon,
  ChatIcon,
} from '../icons';
import { createPage, deletePage, updatePageStage, createProjectLabel, deleteProjectLabel } from '../../lib/api';
import CardModal from './CardModal';
import ConfirmDialog from './ConfirmDialog';

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

// Linked-file (CS-3 Asset) chip label + icon per asset type (D-E). "page" reads as "planche".
const LINKED_TYPE_META: Record<AssetType, { label: string; icon: 'doc' | 'img' }> = {
  scenario: { label: 'scénario', icon: 'doc' },
  texte: { label: 'texte', icon: 'doc' },
  dessin: { label: 'dessin', icon: 'img' },
  page: { label: 'planche', icon: 'img' },
  ref: { label: 'réf', icon: 'img' },
};

// A manual fileTag is hidden once a linked file of its mapped type exists (D-E). `double` is a
// page-format flag, never a file type, so it maps to nothing and always renders.
export const FILE_TAG_COVERING_TYPES: Record<PageFileTag, AssetType[]> = {
  scenario: ['scenario', 'texte'],
  nemu: ['dessin'],
  ref: ['ref'],
  double: [],
};

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const mi = Number(m) - 1;
  return `${Number(d)} ${MONTHS_FR[mi] ?? ''}`.trim();
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function chapterChipLabel(c: WorkspaceChapter): string {
  return c.number === 0 ? 'Prologue' : `Ch. ${c.number}`;
}

export interface KanbanBoardProps {
  slug: string;
  chapters: WorkspaceChapter[];
  initialPages: WorkspacePage[];
  readOnly?: boolean;
  members?: WorkspaceMember[];
  labels?: ProjectLabelItem[];
  isOwner?: boolean;
  viewerId?: string | null;
}

export default function KanbanBoard({
  slug,
  chapters,
  initialPages,
  readOnly,
  members = [],
  labels: initialLabels = [],
  isOwner = false,
  viewerId = null,
}: KanbanBoardProps) {
  const [pages, setPages] = useState<WorkspacePage[]>(initialPages);
  const [labels, setLabels] = useState<ProjectLabelItem[]>(initialLabels);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [labelToDelete, setLabelToDelete] = useState<ProjectLabelItem | null>(null);
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  // null = "Toutes" / unassigned view is implicit; we default to the first chapter when one exists.
  const [selectedChapter, setSelectedChapter] = useState<string | null>(
    chapters[0]?.id ?? null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PageStage | null>(null);
  const [error, setError] = useState(false);

  const scopedPages = pages
    .filter((p) => (selectedChapter === null ? p.chapterId === null : p.chapterId === selectedChapter))
    .filter((p) =>
      selectedLabelIds.length === 0
        ? true
        : p.labels.some((l) => selectedLabelIds.includes(l.id)),
    )
    .filter((p) =>
      selectedAssigneeIds.length === 0
        ? true
        : p.assignees.some((a) => selectedAssigneeIds.includes(a.accountId)),
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

  // Reconcile the palette AND every card's label bars when a label is created/renamed/recolored/deleted.
  function handleLabelsChange(next: ProjectLabelItem[]) {
    setLabels(next);
    const byId = new Map(next.map((l) => [l.id, l]));
    setPages((ps) =>
      ps.map((p) => ({
        ...p,
        labels: p.labels.map((l) => byId.get(l.id)).filter((l): l is ProjectLabelItem => !!l),
      })),
    );
    setSelectedLabelIds((ids) => ids.filter((id) => byId.has(id)));
  }

  function toggleLabelFilter(id: string) {
    setSelectedLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleAssigneeFilter(id: string) {
    setSelectedAssigneeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function confirmDeleteLabel(l: ProjectLabelItem) {
    try {
      await deleteProjectLabel(l.id);
      handleLabelsChange(labels.filter((x) => x.id !== l.id));
    } catch {
      /* leave the palette as-is on error */
    }
    setLabelToDelete(null);
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

      {/* Combined filter bar (CS-2 card-modal extension) — étiquettes (+ create) & assigné·e/Moi,
          auto-apply, all filters combine (AND across dimensions, OR within). */}
      {(labels.length > 0 || members.length > 0 || !readOnly) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            borderBottom: '2px solid var(--border)',
            fontSize: 13,
            fontWeight: 700,
            flexWrap: 'wrap',
            background: 'var(--paper)',
          }}
        >
          <span style={{ color: 'var(--ink2)' }}>Filtres :</span>

          {labels.length > 0 && <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Étiquettes</span>}
          {labels.map((l) => {
            const active = selectedLabelIds.includes(l.id);
            return (
              <span
                key={l.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: '2px solid var(--ink)',
                  borderRadius: 5,
                  minHeight: 30,
                  overflow: 'hidden',
                  background: active ? l.color : 'var(--card)',
                  color: active ? '#fff' : 'var(--ink)',
                }}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleLabelFilter(l.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    padding: '4px 6px 4px 10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 12, height: 12, borderRadius: 3, background: l.color, border: '1.5px solid var(--ink)' }}
                  />
                  {l.name}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Supprimer l'étiquette ${l.name}`}
                    onClick={() => setLabelToDelete(l)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      padding: '0 8px',
                      height: '100%',
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            );
          })}

          {!readOnly && (
            <LabelCreatePopover slug={slug} onCreated={(created) => setLabels((ls) => [...ls, created])} />
          )}

          {/* Assigné·e group — centered in the filter bar (auto margins push it to the middle). */}
          {members.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 auto' }}>
              <span aria-hidden="true" style={{ width: 2, height: 20, background: 'var(--border)', margin: '0 2px' }} />
              <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>Assigné·e</span>
              {members.map((m) => {
                const active = selectedAssigneeIds.includes(m.accountId);
                const label = m.accountId === viewerId ? 'Moi' : m.displayName;
                return (
                  <button
                    key={m.accountId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAssigneeFilter(m.accountId)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '2px solid var(--ink)',
                      borderRadius: 20,
                      padding: '4px 11px 4px 5px',
                      cursor: 'pointer',
                      minHeight: 30,
                      fontWeight: 700,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      background: active ? 'var(--accent)' : 'var(--card)',
                      color: active ? '#fff' : 'var(--ink)',
                    }}
                  >
                    {m.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar} alt="" width={20} height={20} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--ink)', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--ink)', background: active ? '#fff' : 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px', display: 'block' }}
                      />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {labelToDelete && (
        <ConfirmDialog
          title="Supprimer l'étiquette ?"
          message={`« ${labelToDelete.name} » sera retirée de toutes les cartes.`}
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDeleteLabel(labelToDelete)}
          onCancel={() => setLabelToDelete(null)}
        />
      )}

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

      {/* 6 production columns (proto 1345–1352). Horizontally scrollable below desktop.
          Greyish-white board surface so the white cards read against it (a11y) — no per-column lanes. */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '16px 18px',
          overflowX: 'auto',
          background: 'var(--board)',
          borderRadius: 8,
        }}
      >
        {PAGE_STAGES.map((stage) => (
          <Column
            key={stage}
            slug={slug}
            stage={stage}
            cards={scopedPages.filter((p) => p.stage === stage)}
            readOnly={readOnly}
            isDropTarget={dropStage === stage}
            dragId={dragId}
            onOpenCard={setOpenPageId}
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

      {openPageId && (
        <CardModal
          pageId={openPageId}
          slug={slug}
          members={members}
          labels={labels}
          viewerId={viewerId}
          isOwner={isOwner}
          readOnly={readOnly}
          onClose={() => setOpenPageId(null)}
          onPageChange={(page) => setPages((ps) => ps.map((p) => (p.id === page.id ? { ...p, ...page } : p)))}
          onDeleted={(id) => {
            setPages((ps) => ps.filter((p) => p.id !== id));
            setOpenPageId(null);
          }}
          onLabelsChange={handleLabelsChange}
        />
      )}
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
  slug,
  stage,
  cards,
  readOnly,
  isDropTarget,
  dragId,
  onOpenCard,
  onDragStartCard,
  onDragEndCard,
  onDropTargetEnter,
  onDropTargetLeave,
  onDropCard,
  onAddCard,
  onMoveCard,
  onRemoveCard,
}: {
  slug: string;
  stage: PageStage;
  cards: WorkspacePage[];
  readOnly?: boolean;
  isDropTarget: boolean;
  dragId: string | null;
  onOpenCard: (id: string) => void;
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
            slug={slug}
            card={card}
            readOnly={readOnly}
            dragging={dragId === card.id}
            onOpen={() => onOpenCard(card.id)}
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
  slug,
  card,
  readOnly,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
}: {
  slug: string;
  card: WorkspacePage;
  readOnly?: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: PageStage) => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside-click close for the ⋯ menu. It is rendered in a portal (below) so it escapes the board's
  // `overflow-x:auto` clipping — the outside check covers both the card and the portalled menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (cardRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const overdue = card.dueDate !== null && card.dueDate < todayStr();

  // Derived rollup badge (D-D): highest linked-file version; absent when nothing is linked.
  const badgeVersion =
    card.linkedFiles.length > 0 ? Math.max(...card.linkedFiles.map((f) => f.version)) : null;

  // Manual fileTags whose mapped type is already carried by a linked-file chip are hidden (D-E).
  const linkedTypes = new Set(card.linkedFiles.map((f) => f.type));
  const visibleFileTags = card.fileTags.filter(
    (t) => !FILE_TAG_COVERING_TYPES[t].some((mapped) => linkedTypes.has(mapped)),
  );

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir ${card.title}`}
      draggable={!readOnly}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setMenuOpen(false);
          return;
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      }}
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
        position: 'relative',
        zIndex: menuOpen ? 30 : undefined,
        border: '2px solid var(--ink)',
        borderRadius: 6,
        padding: 8,
        background: 'var(--card)',
        boxShadow: '2px 2px 0 var(--shadow)',
        opacity: dragging ? 0.5 : 1,
        cursor: readOnly ? 'pointer' : 'grab',
      }}
    >
      {/* Label color bars */}
      {card.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
          {card.labels.map((l) => (
            <span
              key={l.id}
              title={l.name}
              style={{ height: 6, minWidth: 28, flex: '1 1 28px', maxWidth: 56, borderRadius: 3, background: l.color, border: '1px solid var(--ink)' }}
            >
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>{l.name}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
        <b>{card.title}</b>
        {badgeVersion !== null && (
          <span
            title="Version la plus récente des fichiers liés"
            aria-label={`Version ${badgeVersion}`}
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 700,
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            ⎘ v{badgeVersion}
          </span>
        )}
      </div>

      {(card.linkedFiles.length > 0 || visibleFileTags.length > 0) && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {/* Linked-file chips (type label + per-file version) first, then un-covered manual tags. */}
          {card.linkedFiles.map((f) => {
            const tm = LINKED_TYPE_META[f.type];
            return (
              <span
                key={f.assetId}
                title={f.filename}
                style={fileChipStyle}
              >
                {tm.icon === 'doc' ? <FileTextIcon size={10} style={{ display: 'inline' }} /> : <ImageIcon size={10} style={{ display: 'inline' }} />}
                {tm.label} v{f.version}
              </span>
            );
          })}
          {visibleFileTags.map((tag) => {
            const tm = FILE_TAG_META[tag];
            return (
              <span
                key={tag}
                title={tm.accent ? 'Double page' : undefined}
                style={{ ...fileChipStyle, background: tm.accent ? 'var(--accent)' : 'transparent', color: tm.accent ? '#fff' : 'var(--ink)' }}
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

      {/* Meta footer — due pill / checklist (x/x) / comment count / assignee stack */}
      {(card.dueDate || card.checklistTotal > 0 || card.commentCount > 0 || card.assignees.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap', fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
          {card.dueDate && (
            <span
              title="Échéance"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                border: '1.5px solid var(--ink)',
                borderRadius: 4,
                padding: '1px 6px',
                background: overdue ? 'var(--accent)' : 'var(--paper)',
                color: overdue ? '#fff' : 'var(--ink)',
              }}
            >
              <CalendarIcon size={11} />
              {formatShortDate(card.dueDate)}
            </span>
          )}
          {card.checklistTotal > 0 && (
            <span title="Checklist" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <ChecklistIcon size={12} />({card.checklistDone}/{card.checklistTotal})
            </span>
          )}
          {card.commentCount > 0 && (
            <span title="Commentaires" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <ChatIcon size={12} />
              {card.commentCount}
            </span>
          )}
          {card.assignees.length > 0 && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}
              title={card.assignees.map((a) => a.displayName).join(', ')}
            >
              {card.assignees.slice(0, 4).map((a, i) =>
                a.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a.accountId}
                    src={a.avatar}
                    alt=""
                    width={20}
                    height={20}
                    style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--ink)', objectFit: 'cover', marginLeft: i === 0 ? 0 : -7, display: 'block' }}
                  />
                ) : (
                  <span
                    key={a.accountId}
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '2px solid var(--ink)',
                      background: 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
                      marginLeft: i === 0 ? 0 : -7,
                      display: 'block',
                    }}
                  />
                ),
              )}
            </span>
          )}
        </div>
      )}

      {/* Action row — ✎ opens the CS-4 collaborative editor on this card's scenario; 👁/⚑ are CS-5
          placeholders (no-op); ⋯ opens the real move+delete menu. */}
      <div style={{ display: 'flex', gap: 4, marginTop: 7, position: 'relative' }}>
        <Link
          href={`/projet/${slug}/editeur/${card.id}`}
          title="Éditer le scénario"
          aria-label="Éditer le scénario"
          onClick={(e) => e.stopPropagation()}
          style={{ ...iconBtnStyle, textDecoration: 'none' }}
        >
          <span aria-hidden="true">✎</span>
        </Link>
        <button type="button" title="Aperçu" aria-label="Aperçu" onClick={(e) => e.stopPropagation()} style={iconBtnStyle}>
          <EyeIcon size={12} />
        </button>
        <Link
          href={`/projet/${slug}/revision/${card.id}`}
          title="Corrections"
          aria-label="Corrections"
          onClick={(e) => e.stopPropagation()}
          style={{ ...iconBtnStyle, textDecoration: 'none' }}
        >
          <span aria-hidden="true">⚑</span>
        </Link>
        {!readOnly && (
          <button
            type="button"
            title="Menu"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 190) });
              setMenuOpen((o) => !o);
              setConfirmDelete(false);
            }}
            style={{ ...iconBtnStyle, marginLeft: 'auto' }}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        )}

        {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false);
            }}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 60,
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
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setConfirmDelete(true);
                setMenuOpen(false);
              }}
              style={{ ...menuItemStyle, color: 'var(--danger)' }}
            >
              Supprimer la carte
            </button>
          </div>,
          document.body,
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer la carte ?"
          message={`« ${card.title} » sera définitivement supprimée.`}
          confirmLabel="Supprimer"
          onConfirm={() => {
            onRemove();
            setConfirmDelete(false);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

const fileChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 9,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 4,
  padding: '1px 5px',
  background: 'transparent',
  color: 'var(--ink)',
};

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

// Inline "create an étiquette" control living in the filter bar (user refinement).
function LabelCreatePopover({ slug, onCreated }: { slug: string; onCreated: (l: ProjectLabelItem) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LABEL_COLORS[0]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function create() {
    const n = name.trim();
    if (!n) return;
    try {
      const created = await createProjectLabel(slug, { name: n, color });
      onCreated(created);
      setName('');
      setColor(LABEL_COLORS[0]);
      setOpen(false);
    } catch {
      /* keep the form open on error */
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Créer une étiquette"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: '2px dashed var(--ink)',
          borderRadius: 5,
          padding: '4px 10px',
          cursor: 'pointer',
          minHeight: 30,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--card)',
          color: 'var(--ink)',
        }}
      >
        ＋ Étiquette
      </button>
      {open && (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 40,
            width: 240,
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '4px 4px 0 var(--shadow)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <input
            aria-label="Nom de l'étiquette"
            placeholder="Nom de l'étiquette"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            style={{
              width: '100%',
              border: '2px solid var(--ink)',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 14,
              fontFamily: 'inherit',
              background: 'var(--card)',
              color: 'var(--ink)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={LABEL_COLOR_NAMES[c]}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ width: 24, height: 24, borderRadius: 6, background: c, border: color === c ? '3px solid var(--ink)' : '2px solid var(--ink2)', cursor: 'pointer' }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void create()}
            className="ep-btn-primary"
            style={{
              alignSelf: 'flex-start',
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 7,
              padding: '7px 14px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 36,
            }}
          >
            Créer
          </button>
        </div>
      )}
    </div>
  );
}
