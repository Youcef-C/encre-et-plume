'use client';

// DR-8 — "Ma liste & coups de cœur" (route /ma-liste). Replica of prototype MA LISTE lines
// 2017-2050: page header + two collapsible collections, re-shaped as an accessible tablist per
// the story's graded acceptance criteria (see plan.md §1 reconciliation note). The "Profils
// suivis" follow strip needs PUB-4 follow data and is out of scope this round (not rendered).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ListItemDto, LikedWorkDto, LikedIllustrationDto } from '@encre-et-plume/shared';
import { WORK_FORMAT_ILLUSTRATIONS } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { useFetchState } from '../../lib/useFetchState';
import ListCard from './ListCard';
import LikeCard from './LikeCard';
import IllustrationListCard from './IllustrationListCard';

type PanelState = 'loading' | 'ready' | 'error';
type TabKey = 'liste' | 'likes';

const TABS: { key: TabKey; id: string }[] = [
  { key: 'liste', id: 'liste' },
  { key: 'likes', id: 'likes' },
];

const UNDO_WINDOW_MS = 5000;

// Optimistic remove + undo, shared by all four removable lists (Ma liste works, Coups de cœur
// works, and now the two illustration sub-lists): flips `pending[id]` on click (grid shows an
// UndoCell in that slot), and either restores it (undo, no API call) or fires the DELETE and
// drops it from state once the window lapses. `// ponytail:` plain timeout-ref map, no server
// "undo" endpoint exists, so undo is purely client-side until the window lapses.
//
// DR-14: the rows themselves are now owned by `useFetchState`, so a lapsed removal records the id in
// a `removed` map the render filters on instead of splicing a local array.
function createOptimisticRemover(opts: {
  setPending: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  timers: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>>>;
  setRemoved: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  remove: (id: string) => Promise<unknown>;
}) {
  const { setPending, timers, setRemoved, remove } = opts;

  function request(id: string) {
    setPending((p) => ({ ...p, [id]: true }));
    timers.current[id] = setTimeout(() => {
      remove(id).catch(() => {});
      setRemoved((r) => ({ ...r, [id]: true }));
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      delete timers.current[id];
    }, UNDO_WINDOW_MS);
  }

  function undo(id: string) {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setPending((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  return { request, undo };
}

function SkeletonGrid() {
  return (
    <div className="ep-malist-grid" role="status" aria-label="Chargement…">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="ep-skeleton-delayed"
          style={{ height: 212, borderRadius: 8, background: 'var(--tone)', opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
      <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="ep-btn-primary"
        style={{
          fontSize: 13,
          fontWeight: 700,
          border: '2px solid var(--ink)',
          padding: '8px 16px',
          cursor: 'pointer',
        }}
      >
        Réessayer
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        padding: '30px 0',
        textAlign: 'center',
        boxShadow: '6px 6px 0 var(--shadow)',
      }}
    >
      <p style={{ color: 'var(--ink2)', fontSize: 15, margin: 0 }}>Votre liste est vide</p>
    </div>
  );
}

// DR-12: a labelled sub-section — real landmark (<section aria-labelledby> + <h2 id>). Used for
// the per-tab split into "Œuvres" / "Collections" / "Illustrations"; only rendered when non-empty.
function ListSection({
  id,
  title,
  spaced,
  children,
}: {
  id: string;
  title: string;
  spaced: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} style={{ marginTop: spaced ? 28 : 0 }}>
      <h2 id={id} style={{ fontSize: 18, textTransform: 'uppercase', margin: '0 0 12px' }}>
        {title}
      </h2>
      <div className="ep-malist-grid">{children}</div>
    </section>
  );
}

function UndoCell({ onUndo }: { onUndo: () => void }) {
  return (
    <div
      style={{
        height: 212,
        border: '3px solid var(--ink)',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        textAlign: 'center',
        padding: '0 12px',
        color: 'var(--ink2)',
        fontSize: 13,
      }}
    >
      <p style={{ margin: 0 }}>Retiré de votre liste.</p>
      <button
        type="button"
        onClick={onUndo}
        style={{
          fontSize: 13,
          fontWeight: 700,
          background: 'none',
          color: 'var(--accent)',
          border: '2px solid var(--ink)',
          borderRadius: 6,
          padding: '6px 14px',
          cursor: 'pointer',
        }}
      >
        Annuler
      </button>
    </div>
  );
}

export default function MaListeClient() {
  const { account, loading: sessionLoading } = useSession();
  const [tab, setTab] = useState<TabKey>('liste');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // DR-14: one shared hook per feed — a transient failure keeps the tab's skeleton and retries.
  const listFeed = useFetchState(() => (account ? api.getMyList() : Promise.resolve(null)), [account]);
  const likesFeed = useFetchState(() => (account ? api.getMyLikes() : Promise.resolve(null)), [account]);
  // Illustrations sub-section (DR-8/DR-9 addendum): saved illustrations join the "Ma liste" tab,
  // liked illustrations join "Coups de cœur" — separate fetch/state, combined readiness/count
  // with the matching work list so loading/error/empty stay a single per-tab experience.
  const savedIllustrationsFeed = useFetchState(
    () => (account ? api.getSavedIllustrations() : Promise.resolve(null)),
    [account],
  );
  const likedIllustrationsFeed = useFetchState(
    () => (account ? api.getLikedIllustrations() : Promise.resolve(null)),
    [account],
  );

  const listState: PanelState = listFeed.state;
  const likesState: PanelState = likesFeed.state;
  const savedIllustrationsState: PanelState = savedIllustrationsFeed.state;
  const likedIllustrationsState: PanelState = likedIllustrationsFeed.state;

  const [listRemoved, setListRemoved] = useState<Record<string, true>>({});
  const [likesRemoved, setLikesRemoved] = useState<Record<string, true>>({});
  const [savedIllustrationsRemoved, setSavedIllustrationsRemoved] = useState<Record<string, true>>({});
  const [likedIllustrationsRemoved, setLikedIllustrationsRemoved] = useState<Record<string, true>>({});

  const list: ListItemDto[] = (listFeed.data ?? []).filter((r) => !listRemoved[r.slug]);
  const likes: LikedWorkDto[] = (likesFeed.data ?? []).filter((r) => !likesRemoved[r.slug]);
  const savedIllustrations: LikedIllustrationDto[] = (savedIllustrationsFeed.data ?? []).filter(
    (r) => !savedIllustrationsRemoved[r.id],
  );
  const likedIllustrations: LikedIllustrationDto[] = (likedIllustrationsFeed.data ?? []).filter(
    (r) => !likedIllustrationsRemoved[r.id],
  );

  const [pending, setPending] = useState<Record<string, true>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [likesPending, setLikesPending] = useState<Record<string, true>>({});
  const likeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savedIllustrationsPending, setSavedIllustrationsPending] = useState<Record<string, true>>({});
  const savedIllustrationsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [likedIllustrationsPending, setLikedIllustrationsPending] = useState<Record<string, true>>({});
  const likedIllustrationsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
      Object.values(likeTimers.current).forEach(clearTimeout);
      Object.values(savedIllustrationsTimers.current).forEach(clearTimeout);
      Object.values(likedIllustrationsTimers.current).forEach(clearTimeout);
    },
    [],
  );

  // DR-9 FE7: re-pointed from the removed `DELETE /me/list/:slug` to the counter-aware
  // `DELETE /reactions/save` (B5) — the single unsave implementation. The two illustration
  // removers (coordinator follow-up) reuse the exact same optimistic-remove/undo logic instead
  // of duplicating it, just parameterized on id shape + which reaction endpoint to call.
  const listRemover = createOptimisticRemover({
    setPending,
    timers,
    setRemoved: setListRemoved,
    remove: (slug) => api.unsaveReaction({ targetType: 'work', targetId: slug }),
  });
  const likesRemover = createOptimisticRemover({
    setPending: setLikesPending,
    timers: likeTimers,
    setRemoved: setLikesRemoved,
    remove: (slug) => api.unlikeReaction({ targetType: 'work', targetId: slug }),
  });
  const savedIllustrationsRemover = createOptimisticRemover({
    setPending: setSavedIllustrationsPending,
    timers: savedIllustrationsTimers,
    setRemoved: setSavedIllustrationsRemoved,
    remove: (id) => api.unsaveReaction({ targetType: 'illustration', targetId: id }),
  });
  const likedIllustrationsRemover = createOptimisticRemover({
    setPending: setLikedIllustrationsPending,
    timers: likedIllustrationsTimers,
    setRemoved: setLikedIllustrationsRemoved,
    remove: (id) => api.unlikeReaction({ targetType: 'illustration', targetId: id }),
  });

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  }

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Ma liste &amp; coups de cœur</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour retrouver votre liste et vos coups de cœur.
        </p>
        <Link
          href="/connexion?redirect=/ma-liste"
          className="ep-btn-primary"
          style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            border: '2px solid var(--ink)',
            padding: '10px 20px',
            textDecoration: 'none',
          }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const visibleList = list.filter((r) => !pending[r.slug]);
  const visibleLikes = likes.filter((r) => !likesPending[r.slug]);
  const visibleSavedIllustrations = savedIllustrations.filter((r) => !savedIllustrationsPending[r.id]);
  const visibleLikedIllustrations = likedIllustrations.filter((r) => !likedIllustrationsPending[r.id]);

  // DR-12: split each tab's works into "Œuvres" and "Collections" (a collection is a Work with
  // format 'Illustration(s)'). Both stay `ListItemDto`/`LikedWorkDto`, so the same optimistic
  // remover + pending map + tab count cover them — only the section + card treatment differs.
  const isCollectionWork = (r: { format: string }) => r.format === WORK_FORMAT_ILLUSTRATIONS;
  const listWorks = list.filter((r) => !isCollectionWork(r));
  const listCollections = list.filter(isCollectionWork);
  const likeWorks = likes.filter((r) => !isCollectionWork(r));
  const likeCollections = likes.filter(isCollectionWork);

  // A tab's readiness/loading/error combines its work-list fetch with its illustrations fetch —
  // one skeleton, one error+retry, one empty state per tab, not two independently-flickering ones.
  const listPanelLoading = listState === 'loading' || savedIllustrationsState === 'loading';
  const listPanelError = listState === 'error' || savedIllustrationsState === 'error';
  const listPanelReady = listState === 'ready' && savedIllustrationsState === 'ready';

  const likesPanelLoading = likesState === 'loading' || likedIllustrationsState === 'loading';
  const likesPanelError = likesState === 'error' || likedIllustrationsState === 'error';
  const likesPanelReady = likesState === 'ready' && likedIllustrationsState === 'ready';

  function retryList() {
    listFeed.retry();
    savedIllustrationsFeed.retry();
  }

  function retryLikes() {
    likesFeed.retry();
    likedIllustrationsFeed.retry();
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 28px 80px' }}>
      <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: '0 0 6px' }}>Ma liste &amp; coups de cœur</h1>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 18 }}>
        Vos titres mis de côté et les œuvres que vous avez aimées.
      </div>

      <div
        role="tablist"
        aria-label="Ma liste et coups de cœur"
        style={{ display: 'flex', gap: 18, borderBottom: '2px solid var(--border)', marginBottom: 20, flexWrap: 'wrap' }}
      >
        {TABS.map((t, i) => {
          const isActive = tab === t.key;
          const isListTab = t.key === 'liste';
          const ready = isListTab ? listPanelReady : likesPanelReady;
          const count = isListTab
            ? visibleList.length + visibleSavedIllustrations.length
            : visibleLikes.length + visibleLikedIllustrations.length;
          return (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              onClick={() => setTab(t.key)}
              type="button"
              className="ep-malist-tab"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: -2,
                padding: '0 0 10px',
                fontFamily: 'var(--display)',
                fontSize: 15,
                textTransform: 'uppercase',
                color: isActive ? 'var(--ink)' : 'var(--ink2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isListTab ? 'Ma liste ' : 'Coups de cœur '}
              {ready && (
                <span
                  style={{
                    background: isListTab ? 'var(--ink)' : 'var(--accent)',
                    color: isListTab ? 'var(--paper)' : '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 5,
                    textTransform: 'none',
                  }}
                >
                  · {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'liste' && (
        <div id="tabpanel-liste" role="tabpanel" aria-labelledby="tab-liste">
          {listPanelLoading && <SkeletonGrid />}
          {listPanelError && (
            <ErrorRetry message="Impossible de charger votre liste." onRetry={retryList} />
          )}
          {listPanelReady && list.length === 0 && savedIllustrations.length === 0 && <EmptyState />}
          {listPanelReady && listWorks.length > 0 && (
            <ListSection id="liste-oeuvres" title="Œuvres" spaced={false}>
              {listWorks.map((item) =>
                pending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => listRemover.undo(item.slug)} />
                ) : (
                  <ListCard key={item.slug} item={item} onRemove={listRemover.request} />
                ),
              )}
            </ListSection>
          )}
          {listPanelReady && listCollections.length > 0 && (
            <ListSection id="liste-collections" title="Collections" spaced={listWorks.length > 0}>
              {listCollections.map((item) =>
                pending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => listRemover.undo(item.slug)} />
                ) : (
                  <ListCard key={item.slug} item={item} onRemove={listRemover.request} />
                ),
              )}
            </ListSection>
          )}
          {listPanelReady && savedIllustrations.length > 0 && (
            <ListSection
              id="liste-illustrations"
              title="Illustrations"
              spaced={listWorks.length > 0 || listCollections.length > 0}
            >
              {savedIllustrations.map((item) =>
                savedIllustrationsPending[item.id] ? (
                  <UndoCell key={item.id} onUndo={() => savedIllustrationsRemover.undo(item.id)} />
                ) : (
                  <IllustrationListCard key={item.id} item={item} onRemove={savedIllustrationsRemover.request} />
                ),
              )}
            </ListSection>
          )}
        </div>
      )}

      {tab === 'likes' && (
        <div id="tabpanel-likes" role="tabpanel" aria-labelledby="tab-likes">
          {likesPanelLoading && <SkeletonGrid />}
          {likesPanelError && (
            <ErrorRetry message="Impossible de charger vos coups de cœur." onRetry={retryLikes} />
          )}
          {likesPanelReady && likes.length === 0 && likedIllustrations.length === 0 && <EmptyState />}
          {likesPanelReady && likeWorks.length > 0 && (
            <ListSection id="likes-oeuvres" title="Œuvres" spaced={false}>
              {likeWorks.map((item) =>
                likesPending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => likesRemover.undo(item.slug)} />
                ) : (
                  <LikeCard key={item.slug} item={item} onRemove={likesRemover.request} />
                ),
              )}
            </ListSection>
          )}
          {likesPanelReady && likeCollections.length > 0 && (
            <ListSection id="likes-collections" title="Collections" spaced={likeWorks.length > 0}>
              {likeCollections.map((item) =>
                likesPending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => likesRemover.undo(item.slug)} />
                ) : (
                  <LikeCard key={item.slug} item={item} onRemove={likesRemover.request} />
                ),
              )}
            </ListSection>
          )}
          {likesPanelReady && likedIllustrations.length > 0 && (
            <ListSection
              id="likes-illustrations"
              title="Illustrations"
              spaced={likeWorks.length > 0 || likeCollections.length > 0}
            >
              {likedIllustrations.map((item) =>
                likedIllustrationsPending[item.id] ? (
                  <UndoCell key={item.id} onUndo={() => likedIllustrationsRemover.undo(item.id)} />
                ) : (
                  <IllustrationListCard key={item.id} item={item} onRemove={likedIllustrationsRemover.request} showLikes />
                ),
              )}
            </ListSection>
          )}
        </div>
      )}
    </div>
  );
}
