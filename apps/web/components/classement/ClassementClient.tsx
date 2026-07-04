'use client';

// DR-7 — "Classement" all-time ranking page. Replica of prototype CLASSEMENT lines 1068-1092.
// URL is the source of truth for the active genre (?genre=, "Tout" = no param); chips are
// toggle buttons (single active), auto-apply on click (no text input, no debounce needed).
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { RankingRow } from '@encre-et-plume/shared';
import { CrownIcon } from '../icons';
import * as api from '../../lib/api';
import RankingList from './RankingList';

const GENRE_CHIPS = ['Tout', 'Shōnen', 'Seinen', 'Fantastique', 'Josei'] as const;

type ListState = 'loading' | 'ready' | 'empty' | 'error';

function GenreChips({ active, onSelect }: { active: string; onSelect: (genre: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 24, fontSize: 13, fontWeight: 700 }}>
      {GENRE_CHIPS.map((chip) => {
        const isActive = chip === active;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(chip)}
            className="ep-chip-toggle"
            style={{
              background: isActive ? 'var(--accent)' : 'var(--card)',
              color: isActive ? '#fff' : 'inherit',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}

function SkeletonList() {
  return (
    <div
      role="status"
      aria-label="Chargement du classement…"
      className="ep-skeleton-delayed"
      style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, overflow: 'hidden', boxShadow: '6px 6px 0 var(--shadow)' }}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderBottom: '2px solid var(--border)' }}>
          <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 8, background: 'var(--tone)', opacity: 0.5 }} />
          <div style={{ width: 52, height: 70, flex: 'none', borderRadius: 5, background: 'var(--tone)', opacity: 0.5 }} />
          <div style={{ flex: 1, height: 17, borderRadius: 4, background: 'var(--tone)', opacity: 0.5 }} />
        </div>
      ))}
    </div>
  );
}

export default function ClassementClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const genreParam = searchParams.get('genre') ?? undefined;
  const active = genreParam ?? 'Tout';

  const [items, setItems] = useState<RankingRow[]>([]);
  const [state, setState] = useState<ListState>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .getRanking(genreParam)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setState(rows.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [genreParam, retryKey]);

  function selectGenre(chip: string) {
    router.push(chip === 'Tout' ? '/classement' : `/classement?genre=${encodeURIComponent(chip)}`);
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 28px 80px' }}>
      <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }} className="ep-menu-item">
        ‹ Accueil
      </Link>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.09em', textTransform: 'uppercase' }}>
            <CrownIcon size={14} />
            Tous les temps
          </div>
          <h1 style={{ fontSize: 42, textTransform: 'uppercase', margin: '3px 0 0' }}>Classement</h1>
        </div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20 }}>
        Les œuvres les plus populaires depuis toujours, tous genres confondus.
      </div>

      <GenreChips active={active} onSelect={selectGenre} />

      <div aria-live="polite">
        {state === 'loading' && <SkeletonList />}
        {state === 'error' && (
          <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
              Impossible de charger le classement. Veuillez réessayer.
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((k) => k + 1)}
              style={{ fontSize: 13, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        )}
        {state === 'empty' && (
          <div style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, padding: '30px 0', textAlign: 'center', boxShadow: '6px 6px 0 var(--shadow)' }}>
            <p style={{ color: 'var(--ink2)', fontSize: 15, margin: 0 }}>Aucune œuvre dans ce genre pour l&apos;instant.</p>
          </div>
        )}
        {state === 'ready' && <RankingList items={items} />}
      </div>
    </div>
  );
}
