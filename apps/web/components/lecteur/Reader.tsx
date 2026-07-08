'use client';

// DR-4 FE-1 — immersive reader shell. Replica of LECTEUR lines 743-849 (dark stage over the
// normal chrome). Orchestrates data fetching + all interactive state; Topbar/ChapterAside/Stage/
// ReaderNav/ReactionsAside/Paywall are presentational children (each independently unit-tested).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { isWork18Plus, type ApiError, type WorkChapterDto, type WorkDetail, type ChapterPagesResponse, type FavoriteWorkDto, type ReactionViewerState } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { useAgeCleared } from '../../lib/ageGate';
import AgeGate from '../age/AgeGate';
import Topbar from './Topbar';
import ChapterAside from './ChapterAside';
import Stage, { type PagesState } from './Stage';
import ReaderNav from './ReaderNav';
import ReactionsAside from './ReactionsAside';
import Paywall from './Paywall';
import ImmersiveBar from './ImmersiveBar';

type WorkState = 'loading' | 'ready' | 'notfound' | 'error' | 'age-refused';

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function Reader({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { account } = useSession();
  const cleared = useAgeCleared(account);
  const isNarrow = useMatchMedia('(max-width: 768px)');
  const forceSingleSpread = useMatchMedia('(max-width: 900px)');
  const stageRef = useRef<HTMLDivElement>(null);

  const [workState, setWorkState] = useState<WorkState>('loading');
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [chapters, setChapters] = useState<WorkChapterDto[]>([]);
  // Distinguishes "chapter list still loading/failed" from "loaded and truly empty" — a work
  // with zero chapters is a normal state and must not surface the pages error UI.
  const [chaptersLoaded, setChaptersLoaded] = useState(false);

  const initialChapter = Math.max(1, parseInt(searchParams.get('chapitre') ?? '1', 10) || 1);
  const initialPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const initialPageConsumed = useRef(false);
  const [chapterNumber, setChapterNumber] = useState(initialChapter);
  const [pagesState, setPagesState] = useState<PagesState>('loading');
  const [pagesData, setPagesData] = useState<ChapterPagesResponse | null>(null);
  const [pagesRetryKey, setPagesRetryKey] = useState(0);
  const [page, setPage] = useState(1);
  const [spreadMode, setSpreadMode] = useState<'single' | 'double'>('single');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteWorkDto[]>([]);
  const [paywallChapter, setPaywallChapter] = useState<{ number: number; title: string | null } | null>(null);

  // Narrow viewports: the chapter list collapses behind a full-width bar (it's long), but
  // Réactions stays EXPANDED below the stage — a collapsed 32px bar reads as "the module
  // disappeared" on mobile (user report, 2026-07-04). Desktop keeps the replica layout.
  useEffect(() => {
    if (isNarrow) {
      setLeftCollapsed(true);
      setRightCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow]);

  useEffect(() => {
    let cancelled = false;
    setWorkState('loading');
    setChaptersLoaded(false);
    api
      .getWork(slug)
      .then((data) => {
        if (cancelled) return;
        setWork(data);
        setWorkState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setWorkState(err.error === 'AGE_RESTRICTED' ? 'age-refused' : err.statusCode === 404 ? 'notfound' : 'error');
      });
    api
      .getWorkChapters(slug, 1)
      .then((r) => {
        if (!cancelled) {
          setChapters(r.items);
          setChaptersLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setPagesState('loading');
    setPage(1);
    api
      .getChapterPages(slug, chapterNumber)
      .then((data) => {
        if (cancelled) return;
        setPagesData(data);
        setPagesState('ready');
        setPaywallChapter(null);
        // DR-11 F-d: honor a `?page=` deep link once, on the initial chapter only — every
        // later chapter switch resets to page 1 (top-of-effect setPage(1) above already did that).
        const start =
          chapterNumber === initialChapter && !initialPageConsumed.current
            ? Math.min(Math.max(1, initialPage), data.totalPages)
            : 1;
        initialPageConsumed.current = true;
        setPage(start);
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        // DR-10: AGE_RESTRICTED and premium-lock are both 403s but mutually exclusive — branch
        // on the error code, not just the status, so a blocked minor never sees the Paywall.
        if (err.error === 'AGE_RESTRICTED') {
          setPagesState('age-restricted');
        } else if (err.statusCode === 403) {
          const ch = chapters.find((c) => c.number === chapterNumber);
          setPaywallChapter({ number: chapterNumber, title: ch?.title ?? null });
          setPagesState('locked');
        } else {
          setPagesState('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, chapterNumber, pagesRetryKey]);

  useEffect(() => {
    if (!account) {
      setFavorites([]);
      return;
    }
    api
      .getMyFavorites()
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [account]);

  // DR-9 FE5: hydrate ♥ chapter-like (re-fetched per chapter) and ★ work-save reaction state.
  const [chapterReaction, setChapterReaction] = useState<ReactionViewerState>({ liked: false, saved: false });
  const [workReaction, setWorkReaction] = useState<ReactionViewerState>({ liked: false, saved: false });
  const currentChapterId = chapters.find((c) => c.number === chapterNumber)?.id ?? null;

  useEffect(() => {
    if (!account || !currentChapterId) {
      setChapterReaction({ liked: false, saved: false });
      return;
    }
    let cancelled = false;
    api
      .getReactionState('chapter', [currentChapterId])
      .then((state) => {
        if (!cancelled) setChapterReaction(state[currentChapterId] ?? { liked: false, saved: false });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account, currentChapterId]);

  useEffect(() => {
    if (!account) {
      setWorkReaction({ liked: false, saved: false });
      return;
    }
    let cancelled = false;
    api
      .getReactionState('work', [slug])
      .then((state) => {
        if (!cancelled) setWorkReaction(state[slug] ?? { liked: false, saved: false });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account, slug]);

  useEffect(() => {
    if (!account || pagesState !== 'ready') return;
    const t = setTimeout(() => {
      api.putReadingProgress({ workSlug: slug, chapterNumber, page }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [account, slug, chapterNumber, page, pagesState]);

  useEffect(() => {
    function onFsChange() {
      setFullscreen(document.fullscreenElement != null);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Story update (2026-07-04): "Plein écran" drives a real immersive layout, not just the native
  // Fullscreen API. The `fullscreen` state (not `document.fullscreenElement`) is the single
  // source of truth the render below branches on, flipped optimistically here so the immersive
  // layout still works when the API is unavailable/rejected (degrade gracefully, per the story).
  // The `fullscreenchange` listener above stays in sync for exits the API drives itself (Esc,
  // browser chrome) — it only ever needs to turn `fullscreen` off, never fight this toggle.
  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    if (next) {
      stageRef.current?.requestFullscreen?.()?.catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.()?.catch(() => {});
    }
  }

  function selectChapter(number: number) {
    setChapterNumber(number);
    router.replace(`/lecteur/${slug}?chapitre=${number}`);
  }

  const effectiveSpreadMode = forceSingleSpread ? 'single' : spreadMode;
  const totalPages = pagesData?.totalPages ?? 1;
  // Story update (States bullet): 2-page spread now steps pages by 2 for roman too, not just
  // manga - the spread toggle is enabled for both read modes (Topbar.tsx).
  const step = effectiveSpreadMode === 'double' ? 2 : 1;

  function goPrev() {
    setPage((p) => Math.max(1, p - step));
  }
  function goNext() {
    setPage((p) => Math.min(totalPages, p + step));
  }
  function setPageDirect(n: number) {
    setPage(Math.min(totalPages, Math.max(1, n)));
  }

  if (workState === 'loading') {
    return (
      <div role="status" aria-label="Chargement du lecteur…" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)' }} />
    );
  }

  if (workState === 'notfound') {
    return (
      <div style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)', color: '#f1ece1', textAlign: 'center', padding: '80px 20px' }}>
        <p>Œuvre introuvable.</p>
        <Link href="/decouvrir" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          ‹ Catalogue
        </Link>
      </div>
    );
  }

  // DR-10: logged-in minor — server-side hard gate, no retry/bypass.
  if (workState === 'age-refused') {
    return (
      <div role="alert" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)', color: '#f1ece1', textAlign: 'center', padding: '80px 20px' }}>
        <p>Ce contenu est réservé aux adultes.</p>
        <Link href={`/oeuvre/${slug}`} style={{ color: 'var(--accent)', fontWeight: 700 }}>
          ‹ Retour à l&apos;œuvre
        </Link>
      </div>
    );
  }

  if (workState === 'error' || !work) {
    return (
      <div role="alert" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)', color: '#f1ece1', textAlign: 'center', padding: '80px 20px' }}>
        Impossible de charger ce lecteur.
      </div>
    );
  }

  const currentChapter = chapters.find((c) => c.number === chapterNumber);

  function loadChapter(chapter: WorkChapterDto) {
    selectChapter(chapter.number);
  }
  function openPaywall(chapter: WorkChapterDto) {
    setPaywallChapter({ number: chapter.number, title: chapter.title });
  }

  // Story update: "◳ Studio" repurposed into a "clear view" toggle - collapses both side asides
  // at once for a bigger, distraction-free panel (distinct from full immersive fullscreen, which
  // unmounts the topbar too). Reuses the existing per-aside collapse state rather than adding a
  // new one: "active" simply means both asides currently happen to be collapsed, regardless of
  // why (this toggle, or the mobile auto-collapse effect above).
  const clearViewActive = leftCollapsed && rightCollapsed;
  function toggleClearView() {
    const next = !clearViewActive;
    setLeftCollapsed(next);
    setRightCollapsed(next);
  }

  // DR-10: gate the whole reader (both normal and fullscreen layouts) behind a single overlay —
  // takes priority over the Paywall (a blocked minor/unconfirmed viewer never sees the premium
  // upsell for content they can't open yet).
  const showAgeGate = isWork18Plus(work.audienceRating) && !cleared;
  // QA round-1 fix: the server does not block a visitor's page fetch (D3 — self-declaration is
  // the client gate), so `pagesData` can be real content even while `showAgeGate` is true. Force
  // Stage into the SAME "no content mounted" placeholder it already uses for a locked chapter
  // (Paywall) — the real pages/slider must never render underneath the gate, only dim it.
  const displayPagesState = showAgeGate ? 'locked' : pagesState;
  const displayPagesData = showAgeGate ? null : pagesData;

  return (
    <div
      ref={stageRef}
      data-ep-reader
      style={{
        background: 'var(--ink)',
        minHeight: fullscreen ? '100vh' : 'calc(100vh - 69px)',
        position: 'relative',
      }}
    >
      {/* AgeGate rendered BEFORE the (optionally blurred) body below: its own Tab-wrap trap only
          guards forward navigation past its last control, so keeping it first in DOM order means
          a Shift+Tab from the auto-focused title escapes above the reader (pre-existing
          behavior), never into the blurred chrome below — no extra `inert` plumbing needed. */}
      {showAgeGate && <AgeGate onBack={() => router.push(`/oeuvre/${slug}`)} />}
      {/* Presentation update (user-specified 2026-07-05): while un-cleared, the reader chrome
          (topbar/asides) renders BLURRED behind the gate instead of a flat backdrop — the actual
          chapter pages stay suppressed via displayPagesState/displayPagesData above regardless. */}
      <div
        {...(showAgeGate
          ? { 'aria-hidden': true, style: { filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none' } }
          : {})}
      >
      {fullscreen ? (
        // "Plein écran" immersive mode (story update, 2026-07-04): topbar + both asides are
        // unmounted entirely (not just visually hidden). QA (round 2) caught that giving
        // ImmersiveBar `flex:none` in a flex column still RESERVES its own layout height (stage
        // only filled ~91% desktop / ~77% mobile, and hiding the bar didn't grow the stage back)
        // — the fix is to stop reserving space at all: the stage content fills this whole
        // position:relative container via `position:absolute;inset:0` (~100% of the viewport at
        // every breakpoint), and ImmersiveBar overlays its bottom edge as its own absolutely
        // positioned sibling instead of a flex row. Auto-hiding it then genuinely uncovers the
        // manga, because it was never taking room away from it to begin with.
        <>
          <div data-testid="fullscreen-stage" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Stage
              workTitle={work.title}
              chapterNumber={chapterNumber}
              chapterTitle={currentChapter?.title ?? null}
              pagesState={displayPagesState}
              pagesData={displayPagesData}
              page={page}
              spreadMode={effectiveSpreadMode}
              onRetry={() => setPagesRetryKey((k) => k + 1)}
              noChapters={chaptersLoaded && chapters.length === 0}
            />
            {!showAgeGate && paywallChapter && (
              <Paywall chapter={paywallChapter} workSlug={slug} onClose={() => setPaywallChapter(null)} />
            )}
            {!showAgeGate && pagesState === 'age-restricted' && (
              <div
                role="alert"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  background: 'rgba(22,19,15,.7)',
                  color: '#f1ece1',
                  textAlign: 'center',
                  zIndex: 40,
                }}
              >
                <p style={{ fontWeight: 700 }}>Ce contenu est réservé aux adultes.</p>
              </div>
            )}
          </div>
          <ImmersiveBar
            page={page}
            totalPages={totalPages}
            step={step}
            onPrev={goPrev}
            onNext={goNext}
            onSetPage={setPageDirect}
            favorites={favorites}
            signedIn={!!account}
            chapters={chapters}
            currentChapterNumber={chapterNumber}
            onLoadChapter={loadChapter}
            onOpenPaywall={openPaywall}
            onExitFullscreen={toggleFullscreen}
          />
        </>
      ) : (
        <div className="ep-reader-shell" style={{ maxWidth: 1560, margin: '0 auto', padding: '18px 28px 22px', width: '100%' }}>
          {/* QA F1 fix (round 2): "✕ Quitter" now renders INSIDE Topbar's own flex row (rightmost,
              next to "Plein écran") instead of as a separately positioned element here — a flex
              child can never overlap a sibling or the site header, whereas any position:fixed/
              absolute coordinate is only ever "usually" non-overlapping. See Topbar.tsx. */}
          <Topbar
            workTitle={work.title}
            workSlug={slug}
            currentChapterNumber={chapterNumber}
            favorites={favorites}
            signedIn={!!account}
            spreadMode={effectiveSpreadMode}
            onSpreadChange={setSpreadMode}
            isFullscreen={fullscreen}
            onFullscreenToggle={toggleFullscreen}
            clearViewActive={clearViewActive}
            onToggleClearView={toggleClearView}
          />
          <div className="ep-reader-columns" style={{ display: 'flex', gap: 22, marginTop: 16, alignItems: 'stretch', justifyContent: 'center' }}>
            <ChapterAside
              chapters={chapters}
              currentChapterNumber={chapterNumber}
              collapsed={leftCollapsed}
              onToggleCollapsed={() => setLeftCollapsed((v) => !v)}
              onLoadChapter={loadChapter}
              onOpenPaywall={openPaywall}
            />

            {/* QA Finding A: `flex:'1 1 auto'` used this column's own (large, double-page) content
                size as its hypothetical main size BEFORE flex-shrink negotiation - so a 2-page
                spread's width alone could exceed the leftover row space and force `.ep-reader-
                columns`' flex-wrap to split the asides onto separate stacked lines instead of
                shrinking this column. `flex:'1 1 0'` (basis 0) makes ordinary flex-grow space
                distribution give this column the row's actual leftover width instead, so the row
                stays a single 3-column line and the stage shrinks rather than the asides wrapping
                away. */}
            {/* min-height:0 + a flex:1 stage-area sub-box give the page a viewport-anchored
                definite height to resolve height:100% against (see .ep-reader-stagearea in
                globals.css), instead of the tallest-aside height that collapsed the manga page. */}
            <div className="ep-reader-stagecol">
              <div className="ep-reader-stagearea">
                <Stage
                  workTitle={work.title}
                  chapterNumber={chapterNumber}
                  chapterTitle={currentChapter?.title ?? null}
                  pagesState={displayPagesState}
                  pagesData={displayPagesData}
                  page={page}
                  spreadMode={effectiveSpreadMode}
                  onRetry={() => setPagesRetryKey((k) => k + 1)}
                  noChapters={chaptersLoaded && chapters.length === 0}
                />
                {!showAgeGate && paywallChapter && (
                  <Paywall chapter={paywallChapter} workSlug={slug} onClose={() => setPaywallChapter(null)} />
                )}
                {!showAgeGate && pagesState === 'age-restricted' && (
                  <div
                    role="alert"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 16,
                      background: 'rgba(22,19,15,.7)',
                      color: '#f1ece1',
                      textAlign: 'center',
                      zIndex: 40,
                    }}
                  >
                    <p style={{ fontWeight: 700 }}>Ce contenu est réservé aux adultes.</p>
                  </div>
                )}
              </div>
              {displayPagesState === 'ready' && (
                <ReaderNav page={page} totalPages={totalPages} step={step} onPrev={goPrev} onNext={goNext} onSetPage={setPageDirect} />
              )}
            </div>

            <ReactionsAside
              workSlug={slug}
              chapterId={currentChapter?.id ?? ''}
              likeCount={currentChapter?.likeCount ?? 0}
              favoriteCount={work.favoriteCount}
              liked={chapterReaction.liked}
              saved={workReaction.saved}
              collapsed={rightCollapsed}
              onToggleCollapsed={() => setRightCollapsed((v) => !v)}
              account={account}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
