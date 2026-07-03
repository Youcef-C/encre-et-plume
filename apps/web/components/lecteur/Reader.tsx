'use client';

// DR-4 FE-1 — immersive reader shell. Replica of LECTEUR lines 743-849 (dark stage over the
// normal chrome). Orchestrates data fetching + all interactive state; Topbar/ChapterAside/Stage/
// ReaderNav/ReactionsAside/Paywall are presentational children (each independently unit-tested).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ApiError, WorkChapterDto, WorkDetail, ChapterPagesResponse, FavoriteWorkDto } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import Topbar from './Topbar';
import ChapterAside from './ChapterAside';
import Stage, { type PagesState } from './Stage';
import ReaderNav from './ReaderNav';
import ReactionsAside from './ReactionsAside';
import Paywall from './Paywall';

type WorkState = 'loading' | 'ready' | 'notfound' | 'error';

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
  const isNarrow = useMatchMedia('(max-width: 768px)');
  const forceSingleSpread = useMatchMedia('(max-width: 900px)');
  const stageRef = useRef<HTMLDivElement>(null);

  const [workState, setWorkState] = useState<WorkState>('loading');
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [chapters, setChapters] = useState<WorkChapterDto[]>([]);

  const initialChapter = Math.max(1, parseInt(searchParams.get('chapitre') ?? '1', 10) || 1);
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

  // Asides collapse behind a toggle on narrow viewports (mobile) — replica desktop layout
  // otherwise (F responsive requirement).
  useEffect(() => {
    if (isNarrow) {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow]);

  useEffect(() => {
    let cancelled = false;
    setWorkState('loading');
    api
      .getWork(slug)
      .then((data) => {
        if (cancelled) return;
        setWork(data);
        setWorkState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setWorkState(err.statusCode === 404 ? 'notfound' : 'error');
      });
    api
      .getWorkChapters(slug, 1)
      .then((r) => {
        if (!cancelled) setChapters(r.items);
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
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        if (err.statusCode === 403) {
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

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void stageRef.current?.requestFullscreen?.();
    }
  }

  function selectChapter(number: number) {
    setChapterNumber(number);
    router.replace(`/lecteur/${slug}?chapitre=${number}`);
  }

  const readMode = pagesData?.readMode ?? 'pages';
  const effectiveSpreadMode = forceSingleSpread ? 'single' : spreadMode;
  const totalPages = pagesData?.totalPages ?? 1;
  const step = effectiveSpreadMode === 'double' && readMode === 'pages' ? 2 : 1;

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

  if (workState === 'error' || !work) {
    return (
      <div role="alert" style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)', color: '#f1ece1', textAlign: 'center', padding: '80px 20px' }}>
        Impossible de charger ce lecteur.
      </div>
    );
  }

  const currentChapter = chapters.find((c) => c.number === chapterNumber);

  return (
    <div ref={stageRef} style={{ background: 'var(--ink)', minHeight: 'calc(100vh - 69px)', position: 'relative' }}>
      <div style={{ maxWidth: 1560, margin: '0 auto', padding: '18px 28px 22px' }}>
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
          readMode={readMode}
          spreadMode={effectiveSpreadMode}
          onSpreadChange={setSpreadMode}
          isFullscreen={fullscreen}
          onFullscreenToggle={toggleFullscreen}
        />
        <div className="ep-reader-columns" style={{ display: 'flex', gap: 22, marginTop: 16, alignItems: 'stretch', justifyContent: 'center' }}>
          <ChapterAside
            chapters={chapters}
            currentChapterNumber={chapterNumber}
            collapsed={leftCollapsed}
            onToggleCollapsed={() => setLeftCollapsed((v) => !v)}
            onLoadChapter={(chapter) => selectChapter(chapter.number)}
            onOpenPaywall={(chapter) => setPaywallChapter({ number: chapter.number, title: chapter.title })}
          />

          <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, position: 'relative' }}>
            <Stage
              workTitle={work.title}
              chapterNumber={chapterNumber}
              chapterTitle={currentChapter?.title ?? null}
              pagesState={pagesState}
              pagesData={pagesData}
              page={page}
              spreadMode={effectiveSpreadMode}
              onRetry={() => setPagesRetryKey((k) => k + 1)}
            />
            {paywallChapter && (
              <Paywall chapter={paywallChapter} workSlug={slug} onClose={() => setPaywallChapter(null)} />
            )}
            {pagesState === 'ready' && (
              <ReaderNav page={page} totalPages={totalPages} step={step} onPrev={goPrev} onNext={goNext} onSetPage={setPageDirect} />
            )}
          </div>

          <ReactionsAside
            likeCount={currentChapter?.likeCount ?? 0}
            favoriteCount={work.favoriteCount}
            collapsed={rightCollapsed}
            onToggleCollapsed={() => setRightCollapsed((v) => !v)}
            account={account}
          />
        </div>
      </div>
    </div>
  );
}
