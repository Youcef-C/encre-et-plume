'use client';

// MC-2 — "Suggestions — par affinité de style & genre" aside. Replica of the prototype TROUVER
// Suggestions panel (lines 1001-1008): dark ink card, accent hard shadow, "Suggestions" display
// title + subtitle lockup, and per-suggestion cards (avatar, name, role·genre, %, reason line).
// Story-required additions the prototype card doesn't draw: a "Profil" link (F-3) + "Proposer" stub
// (MC-3) — same pair/order as MC-1's PartnerCard. Self-fetching independent feed (fetch once on
// mount) so a failure here never blanks the directory grid and filter changes never refetch it.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { type CreatorRole, type MatchSuggestion, type MatchSuggestionsResponse } from '@encre-et-plume/shared';
import * as api from '../../lib/api';

const ROLE_LABEL: Record<CreatorRole, string> = {
  dessinateur: 'Dessinateur·rice',
  scenariste: 'Scénariste',
};

type Status = 'loading' | 'ready' | 'empty' | 'error';

const cardBox: React.CSSProperties = {
  listStyle: 'none',
  background: '#241f19',
  border: '2px solid #4a4239',
  borderRadius: 8,
  padding: 10,
};

const actionBase: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid #4a4239',
  borderRadius: 5,
  padding: '7px 5px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

function SkeletonCard() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{ ...cardBox, height: 88, opacity: 0.5 }}
    />
  );
}

function SuggestionCard({
  item,
  onProposer,
}: {
  item: MatchSuggestion;
  onProposer: (item: MatchSuggestion) => void;
}) {
  const { name, slug, role, genre, avatarUrl, affinityScore, reason } = item;
  const roleLine = genre ? `${ROLE_LABEL[role]} · ${genre}` : ROLE_LABEL[role];

  return (
    <li style={cardBox}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: '2px solid #4a4239',
            flex: 'none',
            background: avatarUrl ? `center/cover url(${avatarUrl})` : 'var(--tone)',
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#b3a899' }}>{roleLine}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
          <span className="sr-only">affinité </span>
          {affinityScore}%
        </span>
      </div>

      <div style={{ fontSize: 11, color: '#b3a899', marginTop: 6 }}>{reason}</div>

      {/* Induced addition — story requires a profile link + propose action, consistent with the
          directory cards. `Proposer` stays an onProposer stub until MC-3 wires the invite modal. */}
      <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
        <Link
          href={`/${slug}`}
          aria-label={`Profil de ${name}`}
          style={{ ...actionBase, textDecoration: 'none', color: '#f1ece1' }}
        >
          Profil
        </Link>
        <button
          type="button"
          onClick={() => onProposer(item)}
          aria-label={`Proposer une collaboration à ${name}`}
          style={{ ...actionBase, background: 'var(--accent)', color: '#fff', border: '2px solid var(--accent)' }}
        >
          Proposer
        </button>
      </div>
    </li>
  );
}

export default function SuggestionsAside({
  onProposer,
}: {
  onProposer: (item: MatchSuggestion) => void;
}) {
  const [data, setData] = useState<MatchSuggestionsResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    api
      .getMatchSuggestions()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setStatus(res.items.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  return (
    <aside
      aria-label="Suggestions — par affinité de style & genre"
      className="ep-suggestions-aside"
      style={{
        width: 264,
        flex: 'none',
        background: '#16130f',
        color: '#f1ece1',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        boxShadow: '5px 5px 0 var(--accent)',
        padding: 16,
      }}
    >
      <div style={{ fontFamily: 'var(--display)', fontSize: 18, textTransform: 'uppercase', color: '#fff', marginBottom: 3 }}>
        Suggestions
      </div>
      <div style={{ fontSize: 12, color: '#b3a899', marginBottom: 13, fontWeight: 500 }}>
        par affinité de style &amp; genre
      </div>

      {status === 'loading' && (
        <ul
          role="status"
          aria-label="Chargement des suggestions…"
          style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: 0, padding: 0 }}
        >
          <SkeletonCard />
          <SkeletonCard />
        </ul>
      )}

      {status === 'error' && (
        <div role="alert">
          <p style={{ fontSize: 12, color: '#f1ece1', marginBottom: 10 }}>
            Impossible de charger les suggestions.
          </p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--accent)',
              borderRadius: 5,
              padding: '8px 16px',
              minHeight: 44,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {status === 'empty' && (
        <p style={{ fontSize: 12, color: '#b3a899', margin: 0, lineHeight: 1.5 }}>
          {data?.incompleteProfile
            ? 'Complétez votre profil pour recevoir des suggestions.'
            : 'Aucune suggestion pour le moment.'}
        </p>
      )}

      {status === 'ready' && data && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: 0, padding: 0 }}>
          {data.items.map((item) => (
            <SuggestionCard key={item.userId} item={item} onProposer={onProposer} />
          ))}
        </ul>
      )}
    </aside>
  );
}
