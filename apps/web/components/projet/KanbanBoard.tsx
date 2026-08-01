'use client';

// CS-2 TABLEAU — the production kanban. Replica of prototype data-projview="tableau"
// (chapter chip row + 6 production columns + page cards). Native HTML5 drag & drop (no dep);
// optimistic stage moves revert on error. The "⋯" card menu is the keyboard path for moving cards.
// CS-2 card-modal extension: whole card opens the CardModal; cards grow Trello-style with label
// bars / due pill / checklist (x/x) / comment count / assignee stack; a label-filter chip row above
// the columns narrows the board (auto-apply, combines with chapters).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  PAGE_STAGES,
  chapterChipLabel,
  chapterProgressPct,
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
  CheckIcon,
  XIcon,
} from '../icons';
import { createPage, deletePage, updatePage, updatePageStage, createProjectLabel, deleteProjectLabel, createChapter } from '../../lib/api';
import CardModal from './CardModal';
import ConfirmDialog from './ConfirmDialog';

/** A card at the last stage counts as done — same terminal stage the API's derivation uses. */
const TERMINAL_STAGE = PAGE_STAGES[PAGE_STAGES.length - 1];

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
/**
 * R8-1 — mirror the server's renumbering after a card is PLACED (the modal's « PLACEMENT » field).
 * `PATCH /pages/:id { position }` rewrites every sibling's slot, but the response carries only the
 * moved card, so the board's copies of its neighbours would keep their old positions — and the
 * modal's placement list, derived from them, would go wrong on the second move. Re-derive the
 * chapter's dense order here instead of refetching: the rule is the same three lines the API runs.
 */
function withPlacement(pages: WorkspacePage[], moved: WorkspacePage): WorkspacePage[] {
  const siblings = pages.filter((p) => p.chapterId === moved.chapterId && p.id !== moved.id).sort((a, b) => a.position - b.position);
  siblings.splice(Math.min(Math.max(moved.position, 0), siblings.length), 0, moved);
  const slots = new Map(siblings.map((p, i) => [p.id, i]));
  return pages.map((p) => (slots.has(p.id) ? { ...p, position: slots.get(p.id)! } : p));
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const mi = Number(m) - 1;
  return `${Number(d)} ${MONTHS_FR[mi] ?? ''}`.trim();
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** « Ch. 2 — La rencontre » — the chip label plus the chapter's own title when it has one. */
function chapterLongLabel(c: WorkspaceChapter): string {
  return `${chapterChipLabel(c)}${c.title ? ` — ${c.title}` : ''}`;
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
  /** CS-10 D-1: leader ∪ co-leader ∪ owner — may delete ANY card. Everyone else only their own. */
  canManage?: boolean;
  /**
   * R4-1 — ProjectWorkspace renders this board only while the Tableau tab is active, so switching
   * tab UNMOUNTS it and coming back re-seeds `pages` / `chapters` / `labels` from the workspace
   * payload, fetched once. Every mutation below therefore rings this seam (the same one CS-7 built
   * for the chapters panel) once the write has landed, so the snapshot the remount reads is fresh.
   * Only on success: a reverted optimistic write changed nothing to refresh.
   *
   * ponytail: the seam is asynchronous — switching tab inside the round-trip time of that one GET
   * still remounts on the old snapshot, and the next mutation repairs it. Subscribe the board to the
   * workspace payload only if that sub-200ms window ever proves to matter.
   */
  onWorkspaceStale?: () => void;
}

export default function KanbanBoard({
  slug,
  chapters: initialChapters,
  initialPages,
  readOnly,
  members = [],
  labels: initialLabels = [],
  isOwner = false,
  viewerId = null,
  canManage = false,
  onWorkspaceStale,
}: KanbanBoardProps) {
  const [pages, setPages] = useState<WorkspacePage[]>(initialPages);
  // R2-2: the "＋" chip creates a chapter in place, so the chip row owns its own list.
  const [chapters, setChapters] = useState<WorkspaceChapter[]>(initialChapters);
  const [labels, setLabels] = useState<ProjectLabelItem[]>(initialLabels);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [labelToDelete, setLabelToDelete] = useState<ProjectLabelItem | null>(null);
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  // null = "Toutes" / unassigned view is implicit; we default to the first chapter when one exists.
  const [selectedChapter, setSelectedChapter] = useState<string | null>(
    initialChapters[0]?.id ?? null,
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PageStage | null>(null);
  // R5-2: the banner now covers two kinds of move, so it carries its own message.
  const [error, setError] = useState<string | null>(null);
  const [chapterError, setChapterError] = useState(false);

  // R2-1/R2-1d: every card belongs to a chapter (DB-enforced), so there is no orphan bucket to
  // select and card creation is only offered while a real chapter is selected.
  const canAddCards = !readOnly && selectedChapter !== null;

  // R3-3 (bug): the chip's bar used to render the server-derived `progressPct` prop, while the board
  // mutates its own `pages` locally — so it stayed stale until a manual reload. Derive it here from
  // the pages we already hold instead, through the SAME shared formula the API uses, and the bar
  // reacts to every local mutation for free: stage change, R2-5 move, card create, card delete.
  // (Editing « PLANCHES PRÉVUES » lives in the Chapitres tab and keeps the `onWorkspaceStale` seam.)
  const chapterProgress = (c: WorkspaceChapter) =>
    chapterProgressPct(
      pages.filter((p) => p.chapterId === c.id && p.stage === TERMINAL_STAGE).length,
      c.targetPages,
    );

  const scopedPages = pages
    .filter((p) => p.chapterId === selectedChapter)
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

  // CS-10 D-1 mirror of `PagesService.deletePage`: leadership may delete any card, everyone else only
  // the cards they created; `createdById === null` (no recorded author) is leadership-only. Defence in
  // depth — the server gate is the real one, this only stops offering an action that would 403.
  const canDeleteCard = (card: WorkspacePage) =>
    canManage || (viewerId !== null && card.createdById === viewerId);

  async function moveCard(id: string, stage: PageStage) {
    const prev = pages;
    const current = pages.find((p) => p.id === id);
    if (!current || current.stage === stage) return;
    setError(null);
    // Optimistic — reflect immediately, revert on failure.
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, stage } : p)));
    try {
      const updated = await updatePageStage(id, stage);
      setPages((ps) => ps.map((p) => (p.id === id ? updated : p)));
      onWorkspaceStale?.();
    } catch {
      setPages(prev);
      setError('Le changement d’étape a échoué. Réessayez.');
    }
  }

  // R5-2 — move the card to another chapter from the "⋯" menu. Deliberately the SAME update path
  // the card modal's « CHAPITRE » select uses (`PATCH /pages/:id { chapterId }`, R2-5): one
  // operation, two entry points. The optimistic write drops the card from the selected chapter's
  // columns and R3-3's derived bars follow for BOTH chapters for free.
  async function moveCardToChapter(id: string, chapterId: string) {
    const prev = pages;
    const current = pages.find((p) => p.id === id);
    if (!current || current.chapterId === chapterId) return;
    setError(null);
    setPages((ps) => ps.map((p) => (p.id === id ? { ...p, chapterId } : p)));
    try {
      const updated = await updatePage(id, { chapterId });
      setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...updated } : p)));
      onWorkspaceStale?.();
    } catch {
      setPages(prev);
      setError('Le déplacement vers le chapitre a échoué. Réessayez.');
    }
  }

  async function addCard(stage: PageStage) {
    if (!selectedChapter) return; // R2-1: a card always belongs to a chapter
    try {
      const created = await createPage(slug, { chapterId: selectedChapter, stage });
      setPages((ps) => [...ps, created]);
      onWorkspaceStale?.();
    } catch {
      setError('La création de la carte a échoué. Réessayez.');
    }
  }

  // R2-2 — one click, no form, no tab switch: the server assigns the next number inside its insert
  // transaction (never computed here, or two collaborators clicking at once would race into a 409)
  // and defaults the title to « Chapitre {n} ». Renaming happens later from the Chapitres tab.
  async function addChapter() {
    setChapterError(false);
    try {
      const created = await createChapter(slug, {});
      setChapters((cs) =>
        [
          ...cs,
          {
            id: created.id,
            number: created.number,
            title: created.title,
            status: 'draft',
            plancheCount: 0,
            // R3-2: carry the server's planned length so the new chip draws its bar immediately.
            targetPages: created.targetPages,
            progressPct: created.progressPct,
          } as WorkspaceChapter,
        ].sort((a, b) => a.number - b.number),
      );
      setSelectedChapter(created.id);
      onWorkspaceStale?.();
    } catch {
      setChapterError(true);
    }
  }

  async function removeCard(id: string) {
    const prev = pages;
    setPages((ps) => ps.filter((p) => p.id !== id));
    try {
      await deletePage(id);
      onWorkspaceStale?.();
    } catch {
      setPages(prev);
      setError('La suppression de la carte a échoué. Réessayez.');
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
    onWorkspaceStale?.();
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
    const c = chapters.find((ch) => ch.id === selectedChapter);
    return c ? chapterLongLabel(c) : '—';
  })();

  // R2-3 — zero chapters. A card cannot exist without one (R2-1), so there is no board to show:
  // this card REPLACES it rather than sitting above a disabled one (which squashed the columns).
  if (chapters.length === 0) {
    // The bottom padding is load-bearing: the card's 4px hard offset shadow needs room, or it
    // bleeds out under the panel's edge.
    return (
      <div style={{ padding: '16px 18px 22px' }}>
        {chapterError && (
          <div role="alert" style={{ ...boardAlertStyle, margin: '0 0 12px' }}>
            La création du chapitre a échoué. Réessayez.
          </div>
        )}
        <div
          style={{
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '4px 4px 0 var(--shadow)',
            background: 'var(--card)',
            padding: '24px 22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              border: '3px solid var(--ink)',
              background: 'var(--paper) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
            }}
          />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', lineHeight: 1 }}>
            Aucun chapitre pour l’instant
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
            Créez un premier chapitre pour organiser vos planches.
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => void addChapter()}
              className="ep-btn-primary"
              style={{
                fontSize: 13,
                fontWeight: 700,
                border: '2px solid var(--ink)',
                borderRadius: 7,
                padding: '9px 16px',
                minHeight: 44,
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: '3px 3px 0 var(--shadow)',
              }}
            >
              Créer un chapitre
            </button>
          )}
        </div>
      </div>
    );
  }

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
          const label = chapterChipLabel(c);
          const pct = chapterProgress(c);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedChapter(c.id)}
              aria-pressed={active}
              // The chip's accessible name stays exactly the chapter label — the bar's visually-hidden
              // "N%" lives inside the button and would otherwise be appended to it.
              aria-label={label}
              // R3-1 — scaled back down from R2-8c (still roomier than the bare prototype chip, so the
              // name plus the bar breathe). The sizing lives in `.ep-chapter-chip` because an inline
              // min-height could not be raised to the 44px tap-target floor by the mobile media query.
              // Still the selector-chip idiom (aria-pressed, proto border/radius), which is why it
              // carries no `.ep-btn-*` intent class: it is not an action button.
              className="ep-chapter-chip"
              style={{
                background: active ? 'var(--accent)' : 'var(--card)',
                color: active ? '#fff' : 'var(--ink)',
              }}
            >
              {label}
              {/* R2-8b — thin progress bar, tokens only. R3-2: drawn for EVERY chapter, since every
                  chapter now has a planned length. The value is exposed as visually-hidden text so it
                  is never colour-only. */}
              <span
                role="progressbar"
                aria-label={`Avancement ${label}`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  display: 'block',
                  height: 4,
                  borderRadius: 2,
                  background: active ? 'rgba(255,255,255,.35)' : 'var(--border)',
                  overflow: 'hidden',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${pct}%`,
                    background: active ? '#fff' : 'var(--accent)',
                  }}
                />
                <span style={srOnly}>{pct}%</span>
              </span>
            </button>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            aria-label="Ajouter un chapitre"
            title="Ajouter un chapitre"
            onClick={() => void addChapter()}
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
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <XIcon size={12} />
                  </button>
                )}
              </span>
            );
          })}

          {!readOnly && (
            <LabelCreatePopover
              slug={slug}
              onCreated={(created) => {
                setLabels((ls) => [...ls, created]);
                onWorkspaceStale?.();
              }}
            />
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
        <div role="alert" style={boardAlertStyle}>
          {error}
        </div>
      )}

      {chapterError && (
        <div role="alert" style={boardAlertStyle}>
          La création du chapitre a échoué. Réessayez.
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
            onAddCard={canAddCards ? () => void addCard(stage) : undefined}
            onMoveCard={(id, to) => void moveCard(id, to)}
            onMoveCardToChapter={(id, chapterId) => void moveCardToChapter(id, chapterId)}
            onRemoveCard={(id) => void removeCard(id)}
            canDeleteCard={canDeleteCard}
            chapters={chapters}
          />
        ))}
      </div>

      {openPageId && (
        <CardModal
          pageId={openPageId}
          slug={slug}
          members={members}
          chapters={chapters}
          pages={pages}
          labels={labels}
          viewerId={viewerId}
          isOwner={isOwner}
          readOnly={readOnly}
          canDelete={canDeleteCard(pages.find((p) => p.id === openPageId) ?? ({ createdById: null } as WorkspacePage))}
          onClose={() => setOpenPageId(null)}
          onPageChange={(page) => setPages((ps) => withPlacement(ps.map((p) => (p.id === page.id ? { ...p, ...page } : p)), page))}
          onDeleted={(id) => {
            setPages((ps) => ps.filter((p) => p.id !== id));
            setOpenPageId(null);
            onWorkspaceStale?.();
          }}
          onLabelsChange={handleLabelsChange}
          // R4-1: the modal's own writes (title, labels, assignees, stage, R2-5 chapter move) land
          // in `workspace.pages` too — it rings the same seam once each write has persisted, never
          // on the optimistic `onPageChange` that precedes it.
          onWorkspaceStale={onWorkspaceStale}
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
      {meta.check && <CheckIcon size={13} style={{ marginLeft: 5, display: 'inline' }} />}
    </>
  );
}

function Column({
  slug,
  stage,
  cards,
  chapters,
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
  onMoveCardToChapter,
  onRemoveCard,
  canDeleteCard,
}: {
  slug: string;
  stage: PageStage;
  cards: WorkspacePage[];
  chapters: WorkspaceChapter[];
  readOnly?: boolean;
  isDropTarget: boolean;
  dragId: string | null;
  onOpenCard: (id: string) => void;
  onDragStartCard: (id: string) => void;
  onDragEndCard: () => void;
  onDropTargetEnter: () => void;
  onDropTargetLeave: () => void;
  onDropCard: (id: string) => void;
  /** Absent = card creation is unavailable here (R2-1: no chapter selected, or none exists). */
  onAddCard?: () => void;
  onMoveCard: (id: string, to: PageStage) => void;
  onMoveCardToChapter: (id: string, chapterId: string) => void;
  onRemoveCard: (id: string) => void;
  canDeleteCard: (card: WorkspacePage) => boolean;
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
            onMoveChapter={(chapterId) => onMoveCardToChapter(card.id, chapterId)}
            onRemove={() => onRemoveCard(card.id)}
            canDelete={canDeleteCard(card)}
            chapters={chapters}
          />
        ))}
        {!readOnly && onAddCard && (
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

const boardAlertStyle: React.CSSProperties = {
  margin: '12px 18px 0',
  border: '2px solid var(--accent)',
  borderRadius: 8,
  background: 'var(--accent-soft)',
  color: 'var(--ink)',
  padding: '9px 13px',
  fontSize: 13,
  fontWeight: 700,
};

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
  onMoveChapter,
  onRemove,
  canDelete,
  chapters,
}: {
  slug: string;
  card: WorkspacePage;
  chapters: WorkspaceChapter[];
  readOnly?: boolean;
  canDelete: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: PageStage) => void;
  onMoveChapter: (chapterId: string) => void;
  onRemove: () => void;
}) {
  // Only the card's own z-index needs the menu state — the menu itself owns everything else.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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
        {(!readOnly || canDelete) && (
          <CardMenu
            card={card}
            chapters={chapters}
            readOnly={readOnly}
            canDelete={canDelete}
            onOpenChange={setMenuOpen}
            onMove={onMove}
            onMoveChapter={onMoveChapter}
            onRequestDelete={() => setConfirmDelete(true)}
          />
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

// R7-3 — LAYOUT ONLY. Colour + hover/focus live in `.ep-menu-item` (globals.css): an inline
// `background`/`color` out-ranks any class rule, which is exactly why this menu had no hover.
const menuItemStyle: React.CSSProperties = {
  textAlign: 'left',
  border: 'none',
  borderRadius: 5,
  padding: '5px 6px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
};

// ── The "⋯" card menu (R5-1 / R5-2 / R5-3) ──────────────────────────────────────────────────────
// This menu is the documented NON-drag path for moving a card, so keyboard operability is a
// functional requirement, not polish: arrows within a level, Right/Enter opens a submenu,
// Left/Escape closes it back, Escape again closes the menu and returns focus to the "⋯" trigger.

const MENU_MARGIN = 8; // the closest the menu (or a submenu) may come to a viewport edge

type MenuBox = { top: number; bottom: number; left: number; right: number };
type MenuPos = { top: number; left: number; maxHeight: number };

/**
 * R5-1 (bug) — placement was `trigger.bottom + 4` with no viewport-height check, and the menu is
 * `position: fixed` inside a portal, so anything past the bottom edge was simply unreachable (there
 * is nothing to scroll): a card low in the viewport lost its lower items, delete worst of all being
 * last. Only the vertical axis was unguarded — the horizontal one was already clamped.
 *
 * `size` is MEASURED, never assumed: R5-2/R5-3 change what the menu contains. `maxHeight` caps it to
 * the viewport so a long chapter submenu scrolls INSIDE the menu instead of past the edge.
 */
export function clampMenuPosition(
  anchor: MenuBox,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  side: 'below' | 'right' = 'below',
): MenuPos {
  const m = MENU_MARGIN;
  const maxHeight = Math.max(120, viewport.height - 2 * m);
  const h = Math.min(size.height, maxHeight);

  // Below the trigger by default; flipped above when that would overflow AND there is room above.
  let top = side === 'below' ? anchor.bottom + 4 : anchor.top;
  if (side === 'below' && top + h > viewport.height - m && anchor.top - 4 - h >= m) {
    top = anchor.top - 4 - h;
  }
  top = Math.max(m, Math.min(top, viewport.height - h - m)); // fallback clamp: never off-screen

  // A submenu flies out to the right of its parent, flipping to the left when it would overflow.
  let left = side === 'below' ? anchor.right - size.width : anchor.right + 4;
  if (side === 'right' && left + size.width > viewport.width - m) left = anchor.left - size.width - 4;
  left = Math.max(m, Math.min(left, Math.max(m, viewport.width - size.width - m)));

  return { top, left, maxHeight };
}

function menuItems(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function focusSibling(root: HTMLElement | null, delta: number): void {
  const list = menuItems(root);
  if (list.length === 0) return;
  const i = list.indexOf(document.activeElement as HTMLElement);
  list[i < 0 ? (delta > 0 ? 0 : list.length - 1) : (i + delta + list.length) % list.length].focus();
}

function CardMenu({
  card,
  chapters,
  readOnly,
  canDelete,
  onOpenChange,
  onMove,
  onMoveChapter,
  onRequestDelete,
}: {
  card: WorkspacePage;
  chapters: WorkspaceChapter[];
  readOnly?: boolean;
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (to: PageStage) => void;
  onMoveChapter: (chapterId: string) => void;
  onRequestDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<'stage' | 'chapter' | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [subPos, setSubPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const subAnchorRef = useRef<HTMLButtonElement | null>(null);

  // R2-5/R5-2: the current chapter is never offered — a no-op destination, exactly like the current
  // stage, which the column submenu has always filtered out.
  const stages = PAGE_STAGES.filter((s) => s !== card.stage);
  const otherChapters = chapters.filter((c) => c.id !== card.chapterId);

  function setOpenState(next: boolean) {
    setOpen(next);
    onOpenChange(next);
    if (!next) setSub(null);
  }

  function closeAll() {
    setOpenState(false);
    triggerRef.current?.focus();
  }

  function closeSub() {
    setSub(null);
    subAnchorRef.current?.focus();
  }

  function openSub(kind: 'stage' | 'chapter', anchor: HTMLButtonElement) {
    subAnchorRef.current = anchor;
    setSub(kind);
  }

  // Outside-pointer close. The menus live in a portal (so they escape the board's `overflow-x:auto`
  // clipping), so the "inside" check has to name all three roots explicitly.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t) || subRef.current?.contains(t)) return;
      setOpenState(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Measure, then place — before paint, so nothing is ever drawn off-screen. Re-placed while open on
  // scroll/resize so the menu never detaches from its trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (triggerRef.current && menuRef.current) {
        setPos(clampMenuPosition(triggerRef.current.getBoundingClientRect(), menuRef.current.getBoundingClientRect(), viewport, 'below'));
      }
      if (subAnchorRef.current && subRef.current) {
        setSubPos(clampMenuPosition(subAnchorRef.current.getBoundingClientRect(), subRef.current.getBoundingClientRect(), viewport, 'right'));
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, sub]);

  useEffect(() => {
    if (open) menuItems(menuRef.current)[0]?.focus();
  }, [open]);
  useEffect(() => {
    if (sub) menuItems(subRef.current)[0]?.focus();
  }, [sub]);

  const panelStyle = (p: MenuPos | null): React.CSSProperties => ({
    position: 'fixed',
    top: p?.top ?? -9999,
    left: p?.left ?? -9999,
    maxHeight: p?.maxHeight,
    overflowY: 'auto',
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
  });

  const subItems: { key: string; label: string; run: () => void }[] =
    sub === 'stage'
      ? stages.map((s) => ({ key: s, label: STAGE_META[s].label, run: () => onMove(s) }))
      : otherChapters.map((c) => ({ key: c.id, label: chapterLongLabel(c), run: () => onMoveChapter(c.id) }));

  const parentItem = (kind: 'stage' | 'chapter', label: string) => (
    <button
      type="button"
      role="menuitem"
      className="ep-menu-item"
      aria-haspopup="menu"
      aria-expanded={sub === kind}
      onClick={(e) => openSub(kind, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          openSub(kind, e.currentTarget);
        }
      }}
      style={menuItemStyle}
    >
      {label}
      {/* `▸` is typography, like the existing `▾` / `‹ ›` — not a pictogram. */}
      <span aria-hidden="true" style={{ float: 'right' }}>
        ▸
      </span>
    </button>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Menu"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpenState(!open);
        }}
        style={{ ...iconBtnStyle, marginLeft: 'auto' }}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div
            ref={menuRef}
            role="menu"
            aria-label="Actions de la carte"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeAll();
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                focusSibling(menuRef.current, e.key === 'ArrowDown' ? 1 : -1);
              }
            }}
            style={panelStyle(pos)}
          >
            {!readOnly && parentItem('stage', 'Déplacer vers une colonne')}
            {!readOnly && otherChapters.length > 0 && parentItem('chapter', 'Déplacer vers un chapitre')}
            {/* CS-10 D-1: only leadership or the card's author is offered the destructive action. */}
            {canDelete && (
              <>
                {!readOnly && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}
                <button
                  type="button"
                  role="menuitem"
                  className="ep-menu-item ep-menu-item--danger"
                  onClick={() => {
                    setOpenState(false);
                    onRequestDelete();
                  }}
                  style={menuItemStyle}
                >
                  Supprimer la carte
                </button>
              </>
            )}
          </div>

          {sub && (
            <div
              ref={subRef}
              role="menu"
              aria-label={sub === 'stage' ? 'Déplacer vers une colonne' : 'Déplacer vers un chapitre'}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  e.stopPropagation();
                  closeSub();
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  focusSibling(subRef.current, e.key === 'ArrowDown' ? 1 : -1);
                }
              }}
              style={panelStyle(subPos)}
            >
              {subItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="ep-menu-item"
                  onClick={() => {
                    item.run();
                    closeAll();
                  }}
                  style={menuItemStyle}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}

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

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
