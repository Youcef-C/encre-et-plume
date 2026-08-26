'use client';

// MC-4 — "Appels à projets" board (route /appels). Replica of prototype APPELS À PROJETS
// (.dc.html lines 1580–1606): header (Mes candidatures / Candidatures reçues stubs + ＋ Poster un
// appel), tagline, filter row, and full-width call rows. Two owner-approved deviations vs the drawn
// frame: the "Je suis :" self-role toggle becomes a "Je cherche :" direction filter (owner rule
// §1/§12, same as /trouver), and "Genre ▾" becomes an OnBrandMultiSelect with removable chips.
// Filters auto-apply (no "Appliquer"). Posting an appeal prepends the returned card without refetch.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GENRES, type CreatorRole, type CallCard, type CallsBoardResponse } from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import { useFetchState, useOverride } from '../../lib/useFetchState';
import OnBrandMultiSelect from '../form/OnBrandMultiSelect';
import CallBoardCard from './CallBoardCard';
import PostCallModal from './PostCallModal';
import ApplyCallModal from './ApplyCallModal';
import CallDetailModal from './CallDetailModal';

type Status = 'loading' | 'ready' | 'empty' | 'error';

const ROLE_OPTIONS: { role: CreatorRole; label: string }[] = [
  { role: 'dessinateur', label: 'Dessinateur·rice' },
  { role: 'scenariste', label: 'Scénariste' },
];

const GENRE_OPTIONS = GENRES.map((g) => ({ value: g.id, label: g.fr }));

const chipBase: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '8px 13px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...chipBase, background: 'var(--accent)', color: '#fff' }
    : { ...chipBase, background: 'var(--card)', color: 'var(--ink)' };
}

// Outline nav buttons (Mes candidatures / Mes appels à projets) — both live (MC-6/MC-7).
// Layout-only; color/border idiom via .ep-btn-secondary at the call sites.
const outlineBtn: React.CSSProperties = {
  fontSize: 13,
  border: '2px solid var(--ink)',
  padding: '8px 14px',
  minHeight: 44,
};

function SkeletonRow() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{
        listStyle: 'none',
        height: 152,
        border: '3px solid var(--ink)',
        borderRadius: 10,
        background: 'var(--tone)',
        opacity: 0.5,
      }}
    />
  );
}

export default function AppelsClient() {
  const { account, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const deepLinkCallId = searchParams.get('call');
  const highlightedRef = useRef<string | null>(null);

  const [role, setRole] = useState<CreatorRole | null>(null);
  const [genres, setGenres] = useState<string[]>([]);

  const [posting, setPosting] = useState(false);
  const [applyTarget, setApplyTarget] = useState<CallCard | null>(null);
  const [detailCallId, setDetailCallId] = useState<string | null>(null);

  const filterKey = JSON.stringify({ role, genres });

  // DR-14: the shared hook owns the load; appended pages and the local card edits (post / apply /
  // withdraw) layer on top and are dropped by a refetch.
  const feed = useFetchState(
    () =>
      account
        ? api.getCallsBoard({ status: 'all', page: 1, ...(role ? { role } : {}), ...(genres.length ? { genre: genres } : {}) })
        : Promise.resolve(null),
    [account, filterKey],
  );
  const [board, setBoard] = useOverride<CallsBoardResponse | null>(feed.data);
  // useMemo keeps a stable identity for the deep-link effect's dep list (lint: exhaustive-deps).
  const items: CallCard[] = useMemo(() => board?.items ?? [], [board]);
  const total = board?.total ?? 0;
  const page = board?.page ?? 1;
  const status: Status =
    feed.state === 'loading' ? 'loading' : feed.state === 'error' ? 'error' : items.length === 0 ? 'empty' : 'ready';

  const setItems = (update: (prev: CallCard[]) => CallCard[]) =>
    setBoard((prev) => (prev ? { ...prev, items: update(prev.items) } : prev));

  async function loadMore() {
    const res = await api.getCallsBoard({
      status: 'all',
      page: page + 1,
      ...(role ? { role } : {}),
      ...(genres.length ? { genre: genres } : {}),
    });
    setBoard((prev) => (prev ? { ...res, items: [...prev.items, ...res.items] } : res));
  }

  const hasMore = status === 'ready' && items.length < total;
  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Single-select "Je cherche" role filter — click the active chip again to clear (same as /trouver).
  function toggleRole(next: CreatorRole) {
    setRole((cur) => (cur === next ? null : next));
  }

  function handleCreated(card: CallCard) {
    setBoard((prev) =>
      prev
        ? { ...prev, items: [card, ...prev.items], total: prev.total + 1 }
        : { items: [card], total: 1, page: 1, pageSize: 1, totalPages: 1 },
    );
  }

  // MC-5: after a successful application, flip that card locally (no refetch) — mark applied and
  // bump its counter so the meta line reads the incremented "N candidatures".
  function handleApplied(callId: string, applicationId: string) {
    setItems((prev) =>
      prev.map((c) =>
        c.id === callId
          ? { ...c, hasApplied: true, myApplicationId: applicationId, applicationCount: c.applicationCount + 1 }
          : c,
      ),
    );
  }

  // MC-6 owner extension: withdraw from the board. On success flip the card back to "Candidater"
  // and decrement its counter locally (mirror of handleApplied, no refetch).
  async function handleWithdraw(callId: string, applicationId: string) {
    await api.withdrawApplication(applicationId);
    setItems((prev) =>
      prev.map((c) =>
        c.id === callId
          ? { ...c, hasApplied: false, myApplicationId: null, applicationCount: Math.max(0, c.applicationCount - 1) }
          : c,
      ),
    );
  }

  // Deep link from "Mes candidatures" (/appels?call=<id>): once the board is loaded, scroll the
  // matching card into view, flash an accent outline (~2s), and move focus for keyboard users.
  // ponytail: highlights only when the call is on the loaded page — a call-detail page is the upgrade path.
  useEffect(() => {
    if (status !== 'ready' || !deepLinkCallId || highlightedRef.current === deepLinkCallId) return;
    if (!items.some((c) => c.id === deepLinkCallId)) return;
    const el = document.getElementById(`call-${deepLinkCallId}`);
    if (!el) return;
    highlightedRef.current = deepLinkCallId;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
    el.style.outline = '3px solid var(--accent)';
    el.style.outlineOffset = '3px';
    // MC-4X (F4): the deep link also opens the detail modal for that call.
    setDetailCallId(deepLinkCallId);
    const t = setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 2000);
    return () => clearTimeout(t);
  }, [status, deepLinkCallId, items]);

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Appels à projets</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour parcourir les appels à projets.
        </p>
        <Link
          href="/connexion?redirect=/appels"
          className="ep-btn-primary"
          style={{
            display: 'inline-block',
            fontSize: 14,
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

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Header (prototype 1583) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: 0 }}>Appels à projets</h1>
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <Link href="/mes-candidatures" className="ep-btn-secondary" style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Mes candidatures
          </Link>
          {/* MC-7: received applicants on the owner's own calls. */}
          <Link href="/candidatures-recues" className="ep-btn-secondary" style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Mes appels à projets
          </Link>
          <button
            type="button"
            onClick={() => setPosting(true)}
            className="ep-btn-primary"
            style={{
              fontSize: 15,
              padding: '11px 20px',
              minHeight: 44,
              fontFamily: 'inherit',
            }}
          >
            ＋ Poster un appel
          </button>
        </div>
      </div>

      {/* Tagline (prototype 1584) */}
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20 }}>
        Postez un scénario en quête d&apos;un trait, ou un univers en quête d&apos;une histoire.
      </div>

      {/* Filter row (prototype 1585 + owner-approved deviations) — auto-applies on change. */}
      <div
        role="group"
        aria-label="Je cherche :"
        style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span style={{ color: 'var(--ink2)', fontWeight: 500, fontSize: 13 }}>Je cherche :</span>
        {ROLE_OPTIONS.map(({ role: r, label }) => (
          <button key={r} type="button" aria-pressed={role === r} onClick={() => toggleRole(r)} style={chipStyle(role === r)}>
            {label}
          </button>
        ))}
        <OnBrandMultiSelect label="Genre" options={GENRE_OPTIONS} values={genres} onChange={setGenres} />
      </div>

      {/* Board */}
      {status === 'loading' && (
        <ul
          role="status"
          aria-label="Chargement des appels…"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {status === 'error' && (
        <div role="alert" style={{ padding: '20px 0' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
            Impossible de charger les appels à projets.
          </p>
          <button
            type="button"
            onClick={feed.retry}
            className="ep-btn-primary"
            style={{
              fontSize: 13,
              border: '2px solid var(--ink)',
              padding: '8px 16px',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {status === 'empty' && (
        <p style={{ color: 'var(--ink2)', fontSize: 15, padding: '20px 0' }}>Aucun appel pour ces filtres.</p>
      )}

      {status === 'ready' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((c) => (
              <CallBoardCard
                key={c.id}
                call={c}
                onCandidater={() => setApplyTarget(c)}
                onVoirDetail={() => setDetailCallId(c.id)}
                onWithdraw={(applicationId) => handleWithdraw(c.id, applicationId)}
              />
            ))}
          </div>
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              {/* Auto-load sentinel — fires loadMore on scroll; the button stays as a fallback. */}
              <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
              <button
                type="button"
                onClick={loadMore}
                className="ep-btn-secondary"
                style={{
                  fontSize: 13,
                  border: '2px solid var(--ink)',
                  padding: '10px 20px',
                  boxShadow: '2px 2px 0 var(--shadow)',
                }}
              >
                Charger plus
              </button>
            </div>
          )}
        </>
      )}

      {posting && <PostCallModal onClose={() => setPosting(false)} onCreated={handleCreated} />}

      {detailCallId && (
        <CallDetailModal
          callId={detailCallId}
          onClose={() => setDetailCallId(null)}
          onCandidater={(c) => {
            setDetailCallId(null);
            setApplyTarget(c);
          }}
          // Round 3: owner edit/delete on the board's own detail modal — refetch the board list.
          onChanged={feed.retry}
          onDeleted={() => {
            setDetailCallId(null);
            feed.retry();
          }}
        />
      )}

      {applyTarget && (
        <ApplyCallModal
          call={applyTarget}
          onClose={() => setApplyTarget(null)}
          onApplied={handleApplied}
        />
      )}
    </div>
  );
}
