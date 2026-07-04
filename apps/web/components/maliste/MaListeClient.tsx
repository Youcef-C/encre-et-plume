'use client';

// DR-8 — "Ma liste & coups de cœur" (route /ma-liste). Replica of prototype MA LISTE lines
// 2017-2050: page header + two collapsible collections, re-shaped as an accessible tablist per
// the story's graded acceptance criteria (see plan.md §1 reconciliation note). The "Profils
// suivis" follow strip needs PUB-4 follow data and is out of scope this round (not rendered).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ListItemDto, LikedWorkDto } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import ListCard from './ListCard';
import LikeCard from './LikeCard';

type PanelState = 'loading' | 'ready' | 'error';
type TabKey = 'liste' | 'likes';

const TABS: { key: TabKey; id: string }[] = [
  { key: 'liste', id: 'liste' },
  { key: 'likes', id: 'likes' },
];

const UNDO_WINDOW_MS = 5000;

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
        style={{
          fontSize: 13,
          fontWeight: 700,
          background: 'var(--accent)',
          color: '#fff',
          border: '2px solid var(--ink)',
          borderRadius: 6,
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

  const [list, setList] = useState<ListItemDto[]>([]);
  const [listState, setListState] = useState<PanelState>('loading');
  const [listRetry, setListRetry] = useState(0);

  const [likes, setLikes] = useState<LikedWorkDto[]>([]);
  const [likesState, setLikesState] = useState<PanelState>('loading');
  const [likesRetry, setLikesRetry] = useState(0);

  // Optimistic remove + undo (F4, extended DR-9 FE7 to the "Coups de cœur" tab too): a slug in
  // `pending`/`likesPending` is hidden from its grid and shows an "Annuler" cell in its place;
  // the timer either restores it (undo) or fires the DELETE and drops it permanently once the
  // window lapses. `// ponytail:` a plain timeout ref map — no DR-9 add-back write exists, so
  // undo is purely client-side until the window lapses.
  const [pending, setPending] = useState<Record<string, true>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [likesPending, setLikesPending] = useState<Record<string, true>>({});
  const likeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setListState('loading');
    api
      .getMyList()
      .then((rows) => {
        if (cancelled) return;
        setList(rows);
        setListState('ready');
      })
      .catch(() => {
        if (!cancelled) setListState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [account, listRetry]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setLikesState('loading');
    api
      .getMyLikes()
      .then((rows) => {
        if (cancelled) return;
        setLikes(rows);
        setLikesState('ready');
      })
      .catch(() => {
        if (!cancelled) setLikesState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [account, likesRetry]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
      Object.values(likeTimers.current).forEach(clearTimeout);
    },
    [],
  );

  // DR-9 FE7: re-pointed from the removed `DELETE /me/list/:slug` to the counter-aware
  // `DELETE /reactions/save` (B5) — the single unsave implementation.
  function requestRemove(slug: string) {
    setPending((p) => ({ ...p, [slug]: true }));
    timers.current[slug] = setTimeout(() => {
      api.unsaveReaction({ targetType: 'work', targetId: slug }).catch(() => {});
      setList((rows) => rows.filter((r) => r.slug !== slug));
      setPending((p) => {
        const next = { ...p };
        delete next[slug];
        return next;
      });
      delete timers.current[slug];
    }, UNDO_WINDOW_MS);
  }

  function undoRemove(slug: string) {
    clearTimeout(timers.current[slug]);
    delete timers.current[slug];
    setPending((p) => {
      const next = { ...p };
      delete next[slug];
      return next;
    });
  }

  function requestUnlike(slug: string) {
    setLikesPending((p) => ({ ...p, [slug]: true }));
    likeTimers.current[slug] = setTimeout(() => {
      api.unlikeReaction({ targetType: 'work', targetId: slug }).catch(() => {});
      setLikes((rows) => rows.filter((r) => r.slug !== slug));
      setLikesPending((p) => {
        const next = { ...p };
        delete next[slug];
        return next;
      });
      delete likeTimers.current[slug];
    }, UNDO_WINDOW_MS);
  }

  function undoUnlike(slug: string) {
    clearTimeout(likeTimers.current[slug]);
    delete likeTimers.current[slug];
    setLikesPending((p) => {
      const next = { ...p };
      delete next[slug];
      return next;
    });
  }

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
          style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '2px solid var(--ink)',
            borderRadius: 6,
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
          const ready = isListTab ? listState === 'ready' : likesState === 'ready';
          const count = isListTab ? visibleList.length : visibleLikes.length;
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
          {listState === 'loading' && <SkeletonGrid />}
          {listState === 'error' && (
            <ErrorRetry message="Impossible de charger votre liste." onRetry={() => setListRetry((k) => k + 1)} />
          )}
          {listState === 'ready' && list.length === 0 && <EmptyState />}
          {listState === 'ready' && list.length > 0 && (
            <div className="ep-malist-grid">
              {list.map((item) =>
                pending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => undoRemove(item.slug)} />
                ) : (
                  <ListCard key={item.slug} item={item} onRemove={requestRemove} />
                ),
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'likes' && (
        <div id="tabpanel-likes" role="tabpanel" aria-labelledby="tab-likes">
          {likesState === 'loading' && <SkeletonGrid />}
          {likesState === 'error' && (
            <ErrorRetry message="Impossible de charger vos coups de cœur." onRetry={() => setLikesRetry((k) => k + 1)} />
          )}
          {likesState === 'ready' && likes.length === 0 && <EmptyState />}
          {likesState === 'ready' && likes.length > 0 && (
            <div className="ep-malist-grid">
              {likes.map((item) =>
                likesPending[item.slug] ? (
                  <UndoCell key={item.slug} onUndo={() => undoUnlike(item.slug)} />
                ) : (
                  <LikeCard key={item.slug} item={item} onRemove={requestUnlike} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
