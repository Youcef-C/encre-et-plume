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
import { createPage, updateChapter } from '../../lib/api';
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
  /** R6-1d — cards whose thumbnail 404'd/expired; they fall back to the halftone tile. */
  const [brokenThumbs, setBrokenThumbs] = useState<string[]>([]);

  const bodyId = `chapter-body-${chapter.id}`;
  const panelId = `chapter-edit-${chapter.id}`;
  const title = chapter.title ?? `Chapitre ${chapter.number}`;
  const open = expanded || editing;

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
          { id: created.id, title: created.title, stage: created.stage, thumbnailUrl: null, fileTags: created.fileTags },
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
            <div style={strip}>
              {chapter.pages.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, margin: 0, alignSelf: 'center' }}>
                  Aucune page liée
                </p>
              ) : (
                chapter.pages.map((p, i) => {
                  // R6-2 — a « double » card IS a two-page spread, so its tile is 2× wide whether or
                  // not the art has landed: linking a file must not reflow the strip.
                  const width = p.fileTags.includes('double') ? THUMB_W * 2 : THUMB_W;
                  const src = p.thumbnailUrl && !brokenThumbs.includes(p.id) ? p.thumbnailUrl : null;
                  return (
                    <div
                      key={p.id}
                      className="ep-chapter-thumb"
                      style={{ ...thumb, width, ...THUMB_FILLS[i % THUMB_FILLS.length] }}
                    >
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
                      <span style={thumbBadge}>{i + 1}</span>
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

            {chapter.resume && !editing && (
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0, padding: '0 14px 13px', lineHeight: 1.5 }}>
                {chapter.resume}
              </p>
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

const strip: React.CSSProperties = {
  display: 'flex',
  gap: 9,
  padding: '13px 14px',
  flexWrap: 'wrap',
  alignItems: 'center',
};

/** The prototype's tile. A « double » spread takes two of these across (R6-2). */
const THUMB_W = 54;

const thumb: React.CSSProperties = {
  position: 'relative',
  width: THUMB_W,
  height: 72,
  border: '2px solid var(--ink)',
  borderRadius: 4,
  flex: 'none',
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
