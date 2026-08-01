'use client';

// CS-7 F1/F7 — one chapter card, replica of the prototype's ESPACE PROJET › data-projview="chapitres"
// block (lines 1355–1389): 3px ink border, radius 10, hard 3px offset shadow; header row with the
// title, the status pill, the "N planches · ♥ likes" meta and "Modifier ▾" pushed right; the
// 54×72 page-thumbnail strip ending in the dashed "＋" tile; the inline edit panel.
//
// Deviations (recorded in plan.md §1): the ✓ and ♥ glyphs are icons from icons.tsx (never text), and
// the edit panel carries a "Supprimer le chapitre" affordance the prototype does not draw. R5-5: the
// dashed tile reads « Nouvelle page » and CREATES one here — story criterion F6's picker is retired
// (under R2-1d "linking an existing page" could only ever mean moving another chapter's page, which
// the card modal and the board's "⋯" menu already do).
import { useState } from 'react';
import type { ChapterDto, UpdateChapterRequest } from '@encre-et-plume/shared';
import { chapterPageNumbers } from '@encre-et-plume/shared';
import { createPage, updateChapter, updatePage } from '../../lib/api';
import { CheckIcon, HeartIcon } from '../icons';
import ChapterForm, { type ChapterFormValues } from './ChapterForm';

/** French compact like count — "2,1k" like the prototype, "980" below a thousand. */
export function formatLikes(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
}

// The prototype's six alternating tile fills, cycled across the strip.
const THUMB_FILLS: React.CSSProperties[] = [
  {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.3px,transparent 1.4px),linear-gradient(150deg,var(--ink) 42%,var(--accent) 42%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--card)',
    backgroundImage: 'radial-gradient(var(--ink) 1.3px,transparent 1.4px)',
    backgroundSize: 'var(--dot) var(--dot)',
  },
  {
    backgroundColor: 'var(--ink)',
    backgroundImage:
      'radial-gradient(rgba(255,255,255,.16) 1.3px,transparent 1.4px),linear-gradient(210deg,var(--accent) 38%,var(--ink) 38%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.3px,transparent 1.4px),linear-gradient(75deg,var(--ink) 42%,var(--accent) 42%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--card)',
    backgroundImage: 'repeating-linear-gradient(90deg,var(--ink) 0 1px,transparent 1px 6px)',
  },
  {
    backgroundColor: 'var(--ink)',
    backgroundImage:
      'radial-gradient(rgba(255,255,255,.16) 1.3px,transparent 1.4px),linear-gradient(40deg,var(--accent) 38%,var(--ink) 38%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
];

export interface ChapterAccordionItemProps {
  chapter: ChapterDto;
  slug: string;
  canWrite: boolean;
  onChanged: (chapter: ChapterDto) => void;
  onRequestDelete: (chapter: ChapterDto) => void;
}

export default function ChapterAccordionItem({
  chapter,
  slug,
  canWrite,
  onChanged,
  onRequestDelete,
}: ChapterAccordionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stripError, setStripError] = useState<string | null>(null);
  /** R8-2 — the card currently being dragged across the strip (native HTML5 dnd, like the board),
   *  and the tile it is hovering, which is what the drop caret is drawn from. */
  const [dragId, setDragId] = useState<string | null>(null);
  /** The previewed slot order (card ids) while a drag is in flight — null when none is. */
  const [preview, setPreview] = useState<string[] | null>(null);
  /** R6-1d — cards whose thumbnail 404'd/expired; they fall back to the halftone tile. */
  const [brokenThumbs, setBrokenThumbs] = useState<string[]>([]);

  const bodyId = `chapter-body-${chapter.id}`;
  const panelId = `chapter-edit-${chapter.id}`;
  const title = chapter.title ?? `Chapitre ${chapter.number}`;
  const open = expanded || editing;
  // R8-2 — while a tile is being dragged the strip renders the PREVIEWED order, so the half-faded
  // card sits where it would land instead of staying put. The numbering follows it: the badges are
  // derived from what is drawn, so the author reads the page numbers the drop will produce.
  const pages =
    preview === null
      ? chapter.pages
      : preview.map((id) => chapter.pages.find((p) => p.id === id)).filter((p) => p !== undefined);
  /** R8-1 — the strip's numbering, doubles consuming two slots. Shared with the card modal's hint. */
  const pageNumbers = chapterPageNumbers(pages);

  /** Slide the dragged card to `targetId`'s slot in the preview. Hovering the dragged tile itself is
   *  a no-op — after a slide it IS what sits under the cursor, and reacting would flip-flop. */
  function previewOver(targetId: string) {
    if (!dragId || targetId === dragId) return;
    setPreview((cur) => {
      const list = cur ?? chapter.pages.map((p) => p.id);
      const from = list.indexOf(dragId);
      const to = list.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return list;
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  }

  function endDrag() {
    setDragId(null);
    setPreview(null);
  }

  async function save(values: ChapterFormValues) {
    const body: UpdateChapterRequest = {
      title: values.title,
      number: values.number,
      resume: values.resume,
      targetPages: values.targetPages, // R2-7 — null clears the planned length
    };
    const updated = await updateChapter(chapter.id, body);
    onChanged(updated);
    setEditing(false);
  }

  // R5-5a — the SAME create path the board's « ＋ Ajouter une carte » uses (`POST /projects/:slug/
  // pages` with this chapter's id, chapter-required since R2-1a). No new route, no picker.
  async function addPage() {
    setStripError(null);
    setCreating(true);
    try {
      const created = await createPage(slug, { chapterId: chapter.id });
      onChanged({
        ...chapter,
        // A brand-new card carries no file yet → placeholder tile (R6-1d), and its tags come from
        // the server so a « double » created elsewhere would already be 2× wide (R6-2).
        pages: [
          ...chapter.pages,
          // R8-1: a new card always lands LAST, so the server's slot is the current length.
          { id: created.id, title: created.title, stage: created.stage, thumbnailUrl: null, fileTags: created.fileTags, position: created.position },
        ],
        plancheCount: chapter.plancheCount + 1,
      });
    } catch {
      // The only failure modes left here are transport/500 — the chapter exists and the caller has
      // « Écriture » — so there is no server message worth surfacing verbatim.
      setStripError('La création de la page a échoué. Réessayez.');
    } finally {
      setCreating(false);
    }
  }

  // R8-2 — place a card at another tile's slot. The board's `moveCard` shape: optimistic first,
  // revert on failure. `PATCH /pages/:id { position }` is the same route the modal's PLACEMENT field
  // uses — dragging and typing a number are one operation, so there is no separate reorder endpoint.
  async function place(id: string, to: number) {
    const prev = chapter.pages;
    const from = prev.findIndex((p) => p.id === id);
    if (from < 0 || to < 0 || to >= prev.length || from === to) return;
    const next = [...prev];
    next.splice(to, 0, ...next.splice(from, 1));
    setStripError(null);
    onChanged({ ...chapter, pages: next.map((p, i) => ({ ...p, position: i })) });
    try {
      await updatePage(id, { position: to + 1 }); // the wire slot is 1-based
    } catch {
      onChanged({ ...chapter, pages: prev });
      setStripError('La réorganisation a échoué. Réessayez.');
    }
  }

  return (
    <li style={card}>
      <div style={{ ...headerRow, ...(open ? { borderBottom: '2px solid var(--border)', background: 'var(--paper)' } : null) }}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            if (editing) {
              setEditing(false);
              setExpanded(false);
            } else {
              setExpanded((v) => !v);
            }
          }}
          style={headerButton}
        >
          <b style={{ fontSize: 16 }}>{title}</b>
          {chapter.status === 'publie' ? (
            <span style={publishedPill}>
              <CheckIcon size={11} />
              Publié
            </span>
          ) : chapter.progressPct >= 100 ? (
            /* R2-8a — every planned planche is done. Deliberately the same red pill as « ✓ Publié »
               (accepted collision, user 2026-07-31): different states, told apart by the label and by
               the check icon, which « Terminé » does not carry. Real text, never an icon. */
            <span style={donePill}>Terminé</span>
          ) : (
            /* R3-2: every chapter has a planned length, so the percentage is always drawn. */
            <span style={inProgressPill}>En cours · {chapter.progressPct}%</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {chapter.plancheCount} planche{chapter.plancheCount > 1 ? 's' : ''}
            {chapter.likeCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <HeartIcon size={11} style={{ color: 'var(--accent)' }} />
                <span>{formatLikes(chapter.likeCount)}</span>
                <span style={srOnly}>j’aime</span>
              </>
            )}
          </span>
        </button>

        {canWrite && (
          <button
            type="button"
            aria-expanded={editing}
            aria-controls={panelId}
            onClick={() => {
              setEditing((v) => !v);
              setExpanded(true);
            }}
            style={modifierBtn}
          >
            Modifier<span aria-hidden="true"> ▾</span>
          </button>
        )}
      </div>

      <div id={bodyId} hidden={!open}>
        {open && (
          <>
            {/* R8-2 — caption the strip and say the tiles move. « ↔ glisser pour réordonner » is the
                prototype's own wording for exactly this affordance (CS-6 « Réorganiser les pages »,
                proto line 1705), so the two screens teach the same gesture. Writers only: a reader
                cannot drag, and a hint for an action they do not have is a lie. */}
            <div style={stripHeader}>
              <span style={{ ...sectionLabel, marginBottom: 0 }}>PAGES</span>
              {canWrite && chapter.pages.length > 1 && (
                <span style={dragHint}>
                  <span aria-hidden="true">↔</span> glisser pour réordonner
                </span>
              )}
            </div>
            <div
              style={strip}
              // Releasing between tiles still commits the previewed order — the drag already told us
              // where the card goes, so a few pixels of gap must not throw the move away.
              onDragOver={canWrite && dragId ? (e) => e.preventDefault() : undefined}
              onDrop={
                canWrite
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain') || dragId;
                      endDrag();
                      if (id && preview) void place(id, preview.indexOf(id));
                    }
                  : undefined
              }
            >
              {pages.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, margin: 0, alignSelf: 'center' }}>
                  Aucune page liée
                </p>
              ) : (
                pages.map((p, i) => {
                  // R6-2 — a « double » card IS a two-page spread, so its tile is 2× wide whether or
                  // not the art has landed: linking a file must not reflow the strip. The width lives
                  // in the stylesheet so the ≤480px override scales BOTH tile sizes (it used to force
                  // `width:72px !important`, squashing a spread back to a single page).
                  const isDouble = p.fileTags.includes('double');
                  const src = p.thumbnailUrl && !brokenThumbs.includes(p.id) ? p.thumbnailUrl : null;
                  return (
                    <div
                      key={p.id}
                      className={`ep-chapter-thumb${isDouble ? ' ep-chapter-thumb--double' : ''}`}
                      data-dragging={dragId === p.id ? '' : undefined}
                      style={{ ...thumb, ...THUMB_FILLS[i % THUMB_FILLS.length], ...(canWrite ? grabbable : null), ...(dragId === p.id ? dragging : null) }}
                      draggable={canWrite}
                      onDragStart={
                        canWrite
                          ? (e) => {
                              e.dataTransfer.setData('text/plain', p.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDragId(p.id);
                            }
                          : undefined
                      }
                      onDragEnd={canWrite ? endDrag : undefined}
                      onDragOver={
                        canWrite
                          ? (e) => {
                              e.preventDefault();
                              previewOver(p.id);
                            }
                          : undefined
                      }
                      onDrop={
                        canWrite
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const id = e.dataTransfer.getData('text/plain') || dragId;
                              const to = preview ? preview.indexOf(id ?? '') : i;
                              // The optimistic reorder re-keys the tiles, so `dragend` may never
                              // fire (same trap as the board) — clear the drag where the drop lands.
                              endDrag();
                              if (id) void place(id, to);
                            }
                          : undefined
                      }
                    >
                      {/* R8-1 — a double is TWO pages: split the wide tile so it reads as two slots. */}
                      {isDouble && <span data-double-rule aria-hidden="true" style={doubleRule} />}
                      {/* R6-1c/d — plain <img> (no next/image), covering the frame. The halftone fill
                          stays underneath, so it is what shows while the image loads; onError drops
                          the <img> for good rather than leaving a broken frame. */}
                      {src ? (
                        <img
                          src={src}
                          alt={p.title}
                          style={thumbImg}
                          onError={() => setBrokenThumbs((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]))}
                        />
                      ) : (
                        <span style={srOnly}>{p.title}</span>
                      )}
                      {/* R8-1 — the derived page number(s). A double shows BOTH pages it represents. */}
                      <span style={thumbBadge}>{pageNumbers[i].label}</span>
                    </div>
                  );
                })
              )}

              {/* R5-5b/d — same dashed 54×72 tile and hover as the prototype draws; only the words
                  changed, and it stays « Écriture »-gated like every other create affordance. */}
              {canWrite && (
                <button type="button" className="ep-chapter-link-tile" disabled={creating} onClick={() => void addPage()}>
                  <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
                    ＋
                  </span>
                  <span style={{ fontSize: 8, fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>Nouvelle page</span>
                </button>
              )}
            </div>

            {stripError && (
              <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)', padding: '0 14px 10px' }}>
                {stripError}
              </div>
            )}

            {/* The résumé is prose, the strip above it is a row of tiles — a rule and a « RÉSUMÉ »
                caption keep the two from reading as one block. Same 2px border the header row uses
                when the accordion is open. */}
            {chapter.resume && !editing && (
              <div style={resumeBlock}>
                <div style={sectionLabel}>RÉSUMÉ</div>
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, lineHeight: 1.5 }}>{chapter.resume}</p>
              </div>
            )}

            {editing && canWrite && (
              <div id={panelId}>
                <ChapterForm
                  idPrefix={`chapter-${chapter.id}`}
                  initial={{
                    title: chapter.title ?? '',
                    number: chapter.number,
                    resume: chapter.resume ?? '',
                    targetPages: chapter.targetPages,
                  }}
                  onSubmit={save}
                  onCancel={() => setEditing(false)}
                  onDelete={() => onRequestDelete(chapter)}
                />
              </div>
            )}
          </>
        )}
      </div>

    </li>
  );
}

const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const card: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '3px 3px 0 var(--shadow)',
  background: 'var(--card)',
  listStyle: 'none',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
};

const headerButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  padding: 0,
  minHeight: 44,
};

const publishedPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--accent)',
  color: '#fff',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
};

// R2-8a — « Terminé ». Same geometry/fill as publishedPill (proto line 1358) minus the check icon.
const donePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--accent)',
  color: '#fff',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
};

const inProgressPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  background: 'var(--card)',
  color: 'var(--accent)',
  border: '2px solid var(--accent)',
  borderRadius: 5,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
};

const modifierBtn: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '5px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'transparent',
  color: 'var(--ink)',
  minHeight: 44,
  whiteSpace: 'nowrap',
};

/** The résumé, fenced off from the tile strip above it. */
const resumeBlock: React.CSSProperties = {
  borderTop: '2px solid var(--border)',
  padding: '11px 14px 13px',
};

/** Same caption idiom as the card modal's field labels. */
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.05em',
  color: 'var(--ink2)',
  marginBottom: 5,
  textTransform: 'uppercase',
};

/** Caption row above the tile strip: « PAGES » on the left, the drag hint pushed right. */
const stripHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
  padding: '11px 14px 0',
};

/** Prototype line 1705's hint, verbatim. It sits next to « PAGES » rather than at the far right the
 *  prototype uses: here it captions the strip right below it, so it belongs to the label. */
const dragHint: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--ink2)',
};

const strip: React.CSSProperties = {
  display: 'flex',
  gap: 9,
  padding: '13px 14px',
  flexWrap: 'wrap',
  alignItems: 'center',
};

/** The prototype's 54×72 tile — geometry lives in `.ep-chapter-thumb` (globals.css) so the ≤480px
 *  override scales the single AND the double width together (R6-2). */
const thumb: React.CSSProperties = {
  position: 'relative',
  // Longhand, not the `border` shorthand: the drag state swaps colour + style, and React warns (and
  // can mis-render) when a shorthand and its longhands are mixed across renders.
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: 'var(--ink)',
  borderRadius: 4,
  flex: 'none',
};

/** R8-2 — a tile is draggable to its slot; the modal's PLACEMENT field is the keyboard path. */
const grabbable: React.CSSProperties = { cursor: 'grab' };

/** R8-2 — the held card: half-faded, outlined in accent, and slid to the slot it would land in. */
const dragging: React.CSSProperties = {
  opacity: 0.5,
  borderColor: 'var(--accent)',
  borderStyle: 'dashed',
};

/** R8-1 — the seam between the two pages of a spread. */
const doubleRule: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 'calc(50% - 1px)',
  width: 2,
  background: 'var(--ink)',
  zIndex: 1,
};

const thumbImg: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 2, // inside the 2px frame's radius-4 corner
};

const thumbBadge: React.CSSProperties = {
  position: 'absolute',
  bottom: -3,
  right: -3,
  fontSize: 9,
  fontWeight: 700,
  background: 'var(--card)',
  color: 'var(--ink)',
  border: '1.5px solid var(--ink)',
  borderRadius: 3,
  padding: '0 4px',
};
