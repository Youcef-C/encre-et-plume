'use client';

// CS-6 — "/projet/[slug]/arrangement" « Réorganiser les pages ». Replica of the prototype's
// ARRANGEMENT screen (.dc.html 1693–1721): the header row (‹ Projet · h1 · « Ch. 2 · 18 planches » ·
// Aperçu · Publier ▾), the chapter tab row with « ↔ glisser pour réordonner », and the 6-column grid
// of page tiles (3px ink border, radius 6, 3px offset shadow, 150px halftone thumbnail, footer with
// the drag handle and « P. n ») and the dashed accent « déposer ici » gap.
// The page wrapper paints NO background — the body halftone paper shows through.
//
// Recorded deviations (plan.md §1.3), graded against these:
//  D-1/D-2 the publish/cadence bar is CS-9's, not built; « Publier ▾ » renders inert.
//  D-3 the « ⠿ » glyph is a DragHandleIcon (every pictogram is an icon — user rule).
//  D-7 the header meta is the prototype's « Ch. 2 · N planches ».
//  D-8 the tabs run newest-first, exactly as proto 1705 draws them.
//
// USER DECISIONS (2026-08-01) — these OVERRIDE the plan's D-4/D-5/D-6 and story criteria F4/F6:
//  · A tile carries NO order buttons: reordering is drag-and-drop. The handle stays keyboard-
//    operable (arrow keys move the focused tile) so the screen is not pointer-only — that is an
//    accessibility floor, not an extra affordance: it adds no control the prototype does not draw.
//  · The cover is POSITIONAL: it is the page in the first slot (« COUV. » badge), so reordering IS
//    how the cover changes — there is no per-page « définir comme couverture » control. What the
//    screen does offer is a per-chapter « Couverture » TOGGLE (does this chapter open on one at
//    all?), which rides the ordinary chapter PATCH. Off ⇒ no badge, and the reader may pair page 1
//    into a spread; on ⇒ the reader always shows page 1 alone.
//  · This screen only REARRANGES: no « ＋ Ajouter », no « Supprimer ». Creating and deleting a page
//    stay where they already live (the Tableau board and the Chapitres strip, CS-2/CS-7).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { ApiError, ChapterDto, ChapterPageRef, ProjectWorkspaceResponse } from '@encre-et-plume/shared';
import {
  chapterChipLabel,
  chapterPageNumbers,
  effectiveCoverPageId,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import OnBrandSwitch from '../form/OnBrandSwitch';
import { getProjectChapters, getProjectWorkspace, updateChapter, updateChapterPageOrder } from '../../lib/api';
import { DragHandleIcon } from '../icons';
import Toast from '../Toast';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; chapters: ChapterDto[]; canWrite: boolean; workspace: ProjectWorkspaceResponse | null }
  | { kind: 'error'; message: string };

/** The prototype's alternating tile fills (proto 1707–1717). Same palette as the CS-7 strip, at the
 *  arrangement tile's 1.4px dot. */
const THUMB_FILLS: React.CSSProperties[] = [
  {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(135deg,var(--ink) 42%,var(--accent) 42%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--card)',
    backgroundImage: 'radial-gradient(var(--ink) 1.4px,transparent 1.5px)',
    backgroundSize: 'var(--dot) var(--dot)',
  },
  {
    backgroundColor: 'var(--ink)',
    backgroundImage:
      'radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.5px),linear-gradient(40deg,var(--accent) 36%,var(--ink) 36%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--card)',
    backgroundImage:
      'radial-gradient(var(--ink) 1.4px,transparent 1.5px),linear-gradient(300deg,var(--ink) 24%,transparent 24%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--accent)',
    backgroundImage:
      'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(160deg,var(--ink) 42%,var(--accent) 42%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
  {
    backgroundColor: 'var(--ink)',
    backgroundImage:
      'radial-gradient(rgba(255,255,255,.16) 1.4px,transparent 1.5px),linear-gradient(210deg,var(--accent) 38%,var(--ink) 38%)',
    backgroundSize: 'var(--dot) var(--dot),cover',
  },
];

/**
 * The placeholder belongs to the CARD, not to the slot: picking the fill by grid index made every
 * pattern shuffle as soon as anything moved, so the author lost track of the page they had just
 * dragged. A stable hash of the card id keeps each page's placeholder its own.
 */
function fillFor(pageId: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < pageId.length; i++) hash = (hash * 31 + pageId.charCodeAt(i)) >>> 0;
  return THUMB_FILLS[hash % THUMB_FILLS.length];
}

export default function ArrangementClient() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : (params.slug as string);
  const router = useRouter();
  const search = useSearchParams();
  const { account, loading: sessionLoading } = useSession();

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(search.get('ch'));
  const [error, setError] = useState<string | null>(null);
  /** aria-live text: « Enregistrement… » then « Ordre enregistré ». */
  const [status, setStatus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** The slot the dashed « déposer ici » gap is drawn at (0..pages.length), or null when idle. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<string[]>([]);
  const [savingCover, setSavingCover] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      router.replace(`/connexion?next=/projet/${slug}/arrangement`);
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    // Two reads, in parallel: the chapters + their cards (the grid), and the workspace — the only
    // place « Aperçu »'s work slug lives. Neither contract gained anything for this screen; the
    // workspace read is optional (a failure just hides « Aperçu »).
    Promise.all([getProjectChapters(slug), getProjectWorkspace(slug).catch(() => null)])
      .then(([list, workspace]) => {
        if (!alive) return;
        setState({ kind: 'ready', chapters: list.chapters, canWrite: list.canWrite, workspace });
      })
      .catch((err: ApiError) => {
        if (alive) setState({ kind: 'error', message: err?.message ?? 'Projet indisponible' });
      });
    return () => {
      alive = false;
    };
  }, [slug, account, sessionLoading, router]);

  const canWrite = state.kind === 'ready' && state.canWrite;

  // D-8 — newest first, exactly as proto 1705 draws the row (the newest chapter is the one being
  // prepared for publish); the Chapitres tab still lists ascending.
  const tabs = useMemo(
    () => (state.kind === 'ready' ? [...state.chapters].sort((a, b) => b.number - a.number) : []),
    [state],
  );
  const chapter = tabs.find((c) => c.id === selectedId) ?? tabs[0] ?? null;

  const pageNumbers = chapter ? chapterPageNumbers(chapter.pages) : [];
  /** The chapter's total page count — the LAST derived number, so a double counts as two. */
  const plancheCount = pageNumbers.length > 0 ? pageNumbers[pageNumbers.length - 1].to : 0;
  const coverId = chapter ? effectiveCoverPageId(chapter) : null;

  /** A transient toast: « Enregistrement… » holds until the request settles, the confirmation clears
   *  itself. Same 3.2 s the révision screen uses. */
  function flashStatus(message: string) {
    setStatus(message);
    window.setTimeout(() => setStatus((s) => (s === message ? null : s)), 3200);
  }

  /** Swap in a refreshed chapter (from a mutation) without touching the others. */
  function putChapter(next: ChapterDto) {
    setState((s) => (s.kind === 'ready' ? { ...s, chapters: s.chapters.map((c) => (c.id === next.id ? next : c)) } : s));
  }

  function selectChapter(id: string) {
    setSelectedId(id);
    setError(null);
    setStatus(null);
    // Keep the tab in the URL so a reload and a deep link land on the same chapter.
    router.replace(`/projet/${slug}/arrangement?ch=${encodeURIComponent(id)}`, { scroll: false });
  }

  // ── the ONE commit path: drag and keyboard both land here, so revert can only be wrong once ──
  async function commitOrder(ids: string[]) {
    if (!chapter) return;
    const previous = chapter.pages;
    const next = ids
      .map((id) => previous.find((p) => p.id === id))
      .filter((p): p is ChapterPageRef => p !== undefined);
    if (next.length !== previous.length) return;

    setError(null);
    setStatus('Enregistrement…');
    // Optimistic. The « COUV. » chip needs nothing extra: the cover is whatever sits in slot 0, so
    // it follows this reordering by itself.
    putChapter({ ...chapter, pages: next.map((p, i) => ({ ...p, position: i })) });
    try {
      putChapter(await updateChapterPageOrder(chapter.id, { pageIds: ids }));
      flashStatus('Ordre enregistré');
    } catch (err) {
      // The server's order wins — and the cover reverts with it, or the failed move would leave the
      // chip on a page that is no longer first.
      putChapter(chapter);
      setStatus(null);
      setError((err as ApiError)?.message ?? 'La réorganisation a échoué. Réessayez.');
    }
  }

  /**
   * CS-6 — the « Couverture » toggle (user, 2026-08-01). Rides the ordinary chapter PATCH: it is one
   * more field on the chapter, not a resource of its own. Optimistic, reverted the same way as a
   * failed reorder.
   */
  async function toggleCover(next: boolean) {
    if (!chapter || savingCover) return;
    const previous = chapter;
    setError(null);
    setSavingCover(true);
    putChapter({ ...chapter, hasCover: next });
    try {
      putChapter(await updateChapter(chapter.id, { hasCover: next }));
      flashStatus(next ? 'Couverture activée' : 'Couverture retirée');
    } catch (err) {
      putChapter(previous);
      setError((err as ApiError)?.message ?? 'La couverture n’a pas pu être modifiée. Réessayez.');
    } finally {
      setSavingCover(false);
    }
  }

  /**
   * The keyboard path, on the drag handle itself — arrow keys move the focused tile one slot. It
   * adds no control the prototype does not draw (the user asked for drag-and-drop only), and a
   * grid that can ONLY be reordered with a pointer is not operable at all for part of the audience.
   * Same `commitOrder` as the drop, so the optimistic revert can only be wrong in one place.
   */
  function move(pageId: string, delta: -1 | 1) {
    if (!chapter) return;
    const ids = chapter.pages.map((p) => p.id);
    const from = ids.indexOf(pageId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void commitOrder(ids);
  }

  /**
   * Drag preview — the grid keeps its REAL order while a card is held and only draws the dashed gap
   * at the slot it would land in (which is exactly what the prototype pictures at 1710/1711: the gap
   * sits between two tiles and the tipped card is elsewhere).
   *
   * This is not cosmetic. The first implementation re-ordered the tiles live, which MOVES the drag
   * source node in the DOM; Chromium then loses the drag session and the drop never fires — the
   * gesture was dead in a real browser (Playwright's `dragTo` hung on it, while it completes on a
   * plain draggable div). Insert-only DOM changes keep the session alive.
   *
   * The gap goes before or after the hovered tile depending on which half the pointer is in, so a
   * card can also be dropped into the LAST slot.
   */
  function previewOver(index: number, e: React.DragEvent<HTMLElement>) {
    if (!dragId || !chapter) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    const slot = after ? index + 1 : index;
    // A slot that would put the card back exactly where it already is is NOT a drop target: promising
    // a move that will not happen is a lie (« déposer ici » before or after the held card itself).
    const from = chapter.pages.findIndex((p) => p.id === dragId);
    setDropIndex(slot === from || slot === from + 1 ? null : slot);
  }

  /** The order the current drop would produce: the held card lifted out and spliced back at the gap. */
  function orderAfterDrop(): string[] | null {
    if (!chapter || !dragId || dropIndex === null) return null;
    const ids = chapter.pages.map((p) => p.id);
    const from = ids.indexOf(dragId);
    if (from < 0) return null;
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    if (to === from) return null; // dropped back where it started
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  }

  /** The off-screen drag ghost, held so it is always removable — see `ghostFrom`. */
  const ghostRef = useRef<HTMLElement | null>(null);

  function dropGhost() {
    ghostRef.current?.remove();
    ghostRef.current = null;
  }

  function endDrag() {
    dropGhost();
    setDragId(null);
    setDropIndex(null);
  }

  /**
   * The ghost that follows the cursor: an OFF-SCREEN CLONE of the whole tile, not the tile itself.
   *
   * The grid hides the held card (so the page is not drawn twice), and the browser rasterizes the
   * drag feedback somewhere between the end of `dragstart` and the next compositor frame — a window
   * we do not control. Pointing the snapshot at the live node therefore raced React's `opacity:0`,
   * and lost in exactly one case: a tile with no artwork. A tile WITH an `<img>` hid the race,
   * because grabbing the image starts a native IMAGE drag whose ghost the container's opacity never
   * touches; a placeholder tile drags the container and came out blank. Cloning removes the race for
   * both, and the ghost is the WHOLE card — halftone placeholder, « COUV. » badge, footer, « P. n ».
   *
   * The clone only has to outlive the snapshot, so it is detached on the next frame — and again on
   * `endDrag`, because it lives OUTSIDE the React tree: a frame that never comes (drag cancelled, a
   * backgrounded tab) would otherwise leave a duplicate card in the document for good.
   */
  function ghostFrom(tile: HTMLElement, e: React.DragEvent<HTMLElement>) {
    dropGhost(); // never stack two
    const box = tile.getBoundingClientRect();
    const clone = tile.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-dragging'); // never inherit the hidden state we are about to set
    // It is a picture, not a second card: strip what makes a tile addressable, and keep it out of
    // the accessibility tree — otherwise the grid briefly reports the held page twice.
    clone.removeAttribute('data-page-id');
    clone.removeAttribute('draggable');
    clone.setAttribute('aria-hidden', 'true');
    // Fixed and off-screen: outside the grid the tile has no track to size it, so pin its real box.
    clone.style.position = 'fixed';
    clone.style.top = '-10000px';
    clone.style.left = '-10000px';
    clone.style.width = `${box.width}px`;
    clone.style.height = `${box.height}px`;
    clone.style.margin = '0';
    clone.style.opacity = '1';
    clone.style.pointerEvents = 'none';
    document.body.appendChild(clone);
    ghostRef.current = clone;
    // jsdom has no setDragImage; a missing ghost is cosmetic, never a broken drop.
    e.dataTransfer.setDragImage?.(clone, e.clientX - box.left, e.clientY - box.top);
    requestAnimationFrame(dropGhost);
  }

  if (state.kind === 'loading') {
    return (
      <main style={shell}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink2)' }}>Chargement…</p>
      </main>
    );
  }
  if (state.kind === 'error') {
    return (
      <main style={shell}>
        <div role="alert" style={errorBand}>
          {state.message}
        </div>
      </main>
    );
  }

  // The tiles keep their real slot order at all times — see `previewOver`.
  const drawn: ChapterPageRef[] = chapter?.pages ?? [];
  const drawnNumbers = pageNumbers;
  /** The gap reserves the held card's real footprint: a « double » spread takes two cells. */
  const gapClass = drawn.find((p) => p.id === dragId)?.fileTags.includes('double')
    ? 'ep-arrangement-gap ep-arrangement-gap--double'
    : 'ep-arrangement-gap';

  return (
    <main style={shell}>
      {/* Header row — proto 1696 */}
      <div style={headerRow}>
        <Link href={`/projet/${slug}`} className="ep-arrangement-back">
          <span aria-hidden="true">‹</span> Projet
        </Link>
        <h1 style={{ fontSize: 30, textTransform: 'uppercase', margin: 0 }}>Réorganiser les pages</h1>
        {chapter && (
          <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
            {chapterChipLabel(chapter)} · {plancheCount} planche{plancheCount > 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {state.workspace && (
          <Link
            href={`/oeuvre/${state.workspace.workSlug}`}
            target="_blank"
            rel="noreferrer"
            className="ep-btn-secondary"
            style={headerBtn}
          >
            Aperçu
          </Link>
        )}
        {/* D-2 — the story lists this control in the header, but its destination (scheduling and
            cadence) is CS-9. Drawn so the criterion is visible, inert so it does not lie. */}
        <button
          type="button"
          className="ep-btn-primary"
          style={headerBtn}
          disabled
          aria-disabled="true"
          title="Programmation de la publication — bientôt disponible"
        >
          Publier<span aria-hidden="true"> ▾</span>
        </button>
      </div>

      {/* Chapter tabs — proto 1705 */}
      <div className="ep-arrangement-tabs">
        <div role="tablist" aria-label="Chapitres" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {tabs.map((c) => {
            const selected = chapter?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className="ep-arrangement-tab"
                data-selected={selected ? '' : undefined}
                onClick={() => selectChapter(c.id)}
              >
                {chapterChipLabel(c)}
              </button>
            );
          })}
        </div>
        {/* Never advertise a gesture the viewer cannot perform (CS-7's rule). */}
        {canWrite && (chapter?.pages.length ?? 0) > 1 && (
          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--ink2)' }}>
            <span aria-hidden="true">↔</span> glisser pour réordonner
            {/* The same instruction for whoever cannot drag — the visible hint stays the
                prototype's verbatim wording. */}
            <span style={srOnly}>
              . Sélectionnez la poignée d’une page et utilisez les flèches du clavier pour la déplacer.
            </span>
          </span>
        )}
      </div>

      {error && (
        <div role="alert" style={errorBand}>
          {error}
        </div>
      )}

      {chapter === null ? (
        <p style={emptyLine}>Aucun chapitre</p>
      ) : (
        <>
          {/* CS-6 — the « Couverture » toggle sits in the tab's PANEL, directly over the pages it
              describes (user, 2026-08-01), not beside the tabs. Not a per-page designation: the
              cover is always the first page, this says whether the chapter OPENS on one. Off ⇒ no
              « COUV. » chip, and the reader treats page 1 as an ordinary page it may pair. */}
          {canWrite && (
            <div className="ep-arrangement-cover-toggle">
              <OnBrandSwitch
                label="Couverture"
                description="La 1re page ; seule dans le lecteur."
                checked={chapter.hasCover}
                disabled={savingCover}
                onChange={(next) => void toggleCover(next)}
              />
            </div>
          )}
          {drawn.length === 0 && <p style={emptyLine}>Aucune page</p>}
          <ul
            role="list"
            className="ep-arrangement-grid"
            // The drop is handled here, once, for the whole grid: a release between tiles (or on the
            // gap itself) must commit the move the author just aimed at, not throw it away.
            onDragOver={canWrite && dragId ? (e) => e.preventDefault() : undefined}
            onDrop={
              canWrite
                ? (e) => {
                    e.preventDefault();
                    const order = orderAfterDrop();
                    endDrag();
                    if (order) void commitOrder(order);
                  }
                : undefined
            }
          >
            {drawn.map((p, i) => {
              const label = `P. ${drawnNumbers[i].label}`;
              const isCover = p.id === coverId;
              const src = p.thumbnailUrl && !brokenThumbs.includes(p.id) ? p.thumbnailUrl : null;
              const held = dragId === p.id;
              const isDouble = p.fileTags.includes('double');
              return (
                <li key={p.id} style={{ display: 'contents' }}>
                  {/* F5 — the dashed accent insertion gap at the slot the card would land in
                      (proto 1710), the label rotated −90° exactly as the prototype does. */}
                  {dropIndex === i && (
                    <div className={gapClass} aria-hidden="true">
                      <span>déposer ici</span>
                    </div>
                  )}
                  <div
                    data-page-id={p.id}
                    className={`ep-arrangement-tile${isDouble ? ' ep-arrangement-tile--double' : ''}`}
                    data-dragging={held ? '' : undefined}
                    draggable={canWrite}
                    onDragStart={
                      canWrite
                        ? (e) => {
                            e.dataTransfer.setData('text/plain', p.id);
                            e.dataTransfer.effectAllowed = 'move';
                            ghostFrom(e.currentTarget, e);
                            setDragId(p.id);
                          }
                        : undefined
                    }
                    onDragEnd={canWrite ? endDrag : undefined}
                    onDragOver={
                      canWrite
                        ? (e) => {
                            e.preventDefault();
                            previewOver(i, e);
                          }
                        : undefined
                    }
                  >
                    {isCover && (
                      <span className="ep-arrangement-couv" aria-label="Couverture du chapitre">
                        COUV.
                      </span>
                    )}
                    <div className="ep-arrangement-thumb" style={fillFor(p.id)}>
                      {/* A « double » IS a two-page spread: the tile spans two grid cells and carries
                          the seam between its two pages, same rule as the CS-7 strip. */}
                      {isDouble && <span className="ep-arrangement-seam" aria-hidden="true" />}
                      {/* Plain <img> over the halftone fill (no next/image, F-10 CDN URLs): the
                          placeholder IS what shows while the thumbnail loads, and a broken URL drops
                          the <img> for good instead of leaving an empty frame. */}
                      {src ? (
                        <img
                          src={src}
                          alt={p.title}
                          // An <img> is natively draggable: grabbing it started an IMAGE drag whose
                          // ghost was the bare artwork, so the same card ghosted differently
                          // depending on where you grabbed it. The tile is the only drag source.
                          draggable={false}
                          style={thumbImg}
                          onError={() => setBrokenThumbs((ids) => (ids.includes(p.id) ? ids : [...ids, p.id]))}
                        />
                      ) : (
                        <span style={srOnly}>{p.title}</span>
                      )}
                    </div>

                    {/* Proto 1707's footer: the handle and the page number, nothing else. */}
                    <div className="ep-arrangement-foot">
                      {canWrite && (
                        <button
                          type="button"
                          className="ep-arrangement-handle"
                          aria-label={`Réorganiser ${label}`}
                          title="Réorganiser"
                          // The handle is the drag grip AND the keyboard path — arrow keys move the
                          // focused tile one slot. No visible order buttons (user, 2026-08-01).
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                              e.preventDefault();
                              move(p.id, -1);
                            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              move(p.id, 1);
                            }
                          }}
                        >
                          <DragHandleIcon size={14} />
                        </button>
                      )}
                      <span data-page-label style={{ fontSize: 12, fontWeight: 700 }}>
                        {label}
                      </span>
                    </div>

                  </div>
                </li>
              );
            })}

            {/* …and the same gap after the last tile, so a card can be dropped into the LAST slot. */}
            {dropIndex === drawn.length && drawn.length > 0 && (
              <li style={{ display: 'contents' }}>
                <div className={gapClass} aria-hidden="true">
                  <span>déposer ici</span>
                </div>
              </li>
            )}
          </ul>
        </>
      )}

      {/* « Enregistrement… » then « Ordre enregistré » — the shared toast, not inline page text. */}
      <Toast message={status} />
    </main>
  );
}

/** Proto 1695 — the page shell. No `background`: the body halftone paper shows through. */
const shell: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '24px 28px 70px' };

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 13,
  marginBottom: 14,
  flexWrap: 'wrap',
};

const headerBtn: React.CSSProperties = {
  fontSize: 13,
  padding: '8px 16px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const errorBand: React.CSSProperties = {
  border: '3px solid var(--danger)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--danger)',
  fontSize: 13,
  fontWeight: 700,
  padding: '10px 14px',
  marginBottom: 14,
};

const emptyLine: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--ink2)',
  margin: '0 0 12px',
};

const thumbImg: React.CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'cover' };

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
