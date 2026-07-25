'use client';

// MC-1 — "Trouver un·e partenaire" (route /trouver). Replica of prototype TROUVER (lines 974-1022):
// header, filter bar ("Je cherche" role toggles + Genres/Localisation multi-selects + Dispo select),
// a 3-col partner grid fed by GET /partners, and the "Appels à projets" preview (GET /calls).
// Filters auto-apply (no "Appliquer" button — project rule). "Charger plus" appends the next page.
// The results row is a flex container so MC-2's Suggestions aside can slot in without relayout.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  GENRES,
  CONTINENTS,
  COUNTRY_CODES,
  PARTNER_REGIONS,
  PARTNER_AVAILABILITIES,
  countryLabelFr,
  type CreatorRole,
  type PartnerAvailability,
  type PartnerCard as PartnerCardData,
  type CallPreview,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandMultiSelect from '../form/OnBrandMultiSelect';
import PartnerCard from './PartnerCard';
import CallsPreview from './CallsPreview';
import SuggestionsAside from './SuggestionsAside';
import InviteModal, { type InviteRecipient } from '../collab/InviteModal';

const ROLE_LABEL_FR: Record<CreatorRole, string> = {
  dessinateur: 'Dessinateur·rice',
  scenariste: 'Scénariste',
};

// Genres = F-20 vocabulary (value = id). Localisation = the round-2 hierarchical facet: continents
// (French name token), countries (ISO alpha-2 value, French label), and the 18 French régions.
const GENRE_OPTIONS = GENRES.map((g) => ({ value: g.id, label: g.fr }));
const LOCATION_OPTIONS = [
  { group: 'Continents', options: CONTINENTS.map((c) => ({ value: c.fr, label: c.fr })) },
  {
    group: 'Pays',
    options: [...COUNTRY_CODES]
      .map((code) => ({ value: code, label: countryLabelFr(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  },
  { group: 'Régions françaises', options: PARTNER_REGIONS.map((r) => ({ value: r, label: r })) },
];

type Status = 'loading' | 'ready' | 'empty' | 'error';

const ROLE_OPTIONS: { role: CreatorRole; label: string }[] = [
  { role: 'dessinateur', label: 'Dessinateur·rice' },
  { role: 'scenariste', label: 'Scénariste' },
];

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

const selectChip: React.CSSProperties = {
  width: 'auto',
  minHeight: 44,
  borderRadius: 5,
  padding: '8px 12px',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...chipBase, background: 'var(--accent)', color: '#fff' }
    : { ...chipBase, background: 'var(--card)', color: 'var(--ink)' };
}

function SkeletonCard() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{
        listStyle: 'none',
        height: 210,
        border: '3px solid var(--ink)',
        borderRadius: 10,
        background: 'var(--tone)',
        opacity: 0.5,
      }}
    />
  );
}

export default function TrouverClient() {
  const { account, loading: sessionLoading } = useSession();

  // MC-3 — the "Proposer" action on cards/suggestions opens the shared invite modal.
  // The page already gates anonymous visitors (early return below), so opening is always allowed here.
  const [inviteTarget, setInviteTarget] = useState<InviteRecipient | null>(null);

  const [role, setRole] = useState<CreatorRole | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [availability, setAvailability] = useState<PartnerAvailability | ''>('');

  const [items, setItems] = useState<PartnerCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status>('loading');
  const [retryKey, setRetryKey] = useState(0);

  const [calls, setCalls] = useState<CallPreview[]>([]);

  const filterKey = JSON.stringify({ role, genres, locations, availability, retryKey });

  // Round 2 (feedback §1): "Je suis" no longer biases results — no viewerRole. No region default
  // either; genres/locations are multi-value facets sent as repeated query keys.
  function buildQuery(nextPage?: number): URLSearchParams {
    const q = new URLSearchParams();
    if (role) q.set('role', role);
    genres.forEach((g) => q.append('genres', g));
    locations.forEach((l) => q.append('locations', l));
    if (availability) q.set('availability', availability);
    if (nextPage) q.set('page', String(nextPage));
    return q;
  }

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setStatus('loading');
    setPage(1);
    api
      .getPartners(buildQuery())
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
        setStatus(res.items.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, filterKey]);

  useEffect(() => {
    if (!account) return;
    // Independent feed — a failing calls endpoint never blanks the directory (DR-1 pattern).
    api.getCalls(2).then((res) => setCalls(res.items)).catch(() => setCalls([]));
  }, [account]);

  async function loadMore() {
    const res = await api.getPartners(buildQuery(page + 1));
    setItems((prev) => [...prev, ...res.items]);
    setPage(res.page);
    setTotal(res.total);
  }

  const hasMore = status === 'ready' && items.length < total;
  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Single-select "Je cherche" role filter — click the active chip again to clear.
  function toggleRole(next: CreatorRole) {
    setRole((cur) => (cur === next ? null : next));
  }

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Trouver un·e partenaire</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour parcourir les portfolios des scénaristes et dessinateur·rices.
        </p>
        <Link
          href="/connexion?redirect=/trouver"
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

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 28px 80px' }}>
      <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: '0 0 6px' }}>Trouver un·e partenaire</h1>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 22 }}>
        Scénaristes &amp; dessinateur·rices — parcourez les portfolios ou laissez l&apos;algorithme suggérer.
      </div>

      {/* Filter bar (replica chip row + approved multi-select deviation) — auto-applies on change. */}
      <div
        role="group"
        aria-label="Je cherche :"
        style={{ display: 'flex', gap: 9, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <span style={{ fontSize: 13, fontWeight: 700 }}>Je cherche :</span>
        {ROLE_OPTIONS.map(({ role: r, label }) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => toggleRole(r)}
            style={chipStyle(role === r)}
          >
            {label}
          </button>
        ))}

        <OnBrandMultiSelect label="Genres" options={GENRE_OPTIONS} values={genres} onChange={setGenres} />
        <OnBrandMultiSelect
          label="Localisation"
          options={LOCATION_OPTIONS}
          values={locations}
          onChange={setLocations}
          searchable
        />

        <OnBrandSelect
          aria-label="Disponibilité"
          value={availability}
          onChange={(e) => setAvailability(e.target.value as PartnerAvailability | '')}
          style={{ ...selectChip, ...(availability ? { background: 'var(--accent)', color: '#fff' } : null) }}
        >
          <option value="">Dispo : toutes</option>
          {PARTNER_AVAILABILITIES.map((a) => (
            <option key={a.key} value={a.key}>
              {a.fr}
            </option>
          ))}
        </OnBrandSelect>
      </div>

      {/* Owner §7: the "Appels à projets" band sits ABOVE the grid (visible without scroll);
          partners stay the primary content below. */}
      <CallsPreview calls={calls} />

      {/* Owner §10: strong on-brand divider + display-font heading so the two zones read as
          distinct sections at every breakpoint. */}
      <h2
        style={{
          fontSize: 30,
          textTransform: 'uppercase',
          margin: '0 0 16px',
          borderTop: '3px solid var(--ink)',
          paddingTop: 18,
        }}
      >
        Partenaires
      </h2>

      <div
        className="ep-trouver-results"
        style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {status === 'loading' && (
            <ul
              className="ep-partners-grid"
              role="status"
              aria-label="Chargement des partenaires…"
              style={{ margin: 0, padding: 0 }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </ul>
          )}

          {status === 'error' && (
            <div role="alert" style={{ padding: '30px 0', textAlign: 'center' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>
                Impossible de charger les partenaires.
              </p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
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
          )}

          {status === 'empty' && (
            <p style={{ color: 'var(--ink2)', fontSize: 15, padding: '30px 0' }}>
              Aucun·e partenaire ne correspond à ces filtres.
            </p>
          )}

          {status === 'ready' && (
            <>
              <ul className="ep-partners-grid" style={{ margin: 0, padding: 0 }}>
                {items.map((partner) => (
                  <PartnerCard
                    key={partner.userId}
                    partner={partner}
                    onProposer={(p) =>
                      setInviteTarget({
                        userId: p.userId,
                        name: p.name,
                        avatarUrl: p.avatarUrl,
                        subtitle: [ROLE_LABEL_FR[p.role], p.location].filter(Boolean).join(' · '),
                      })
                    }
                  />
                ))}
              </ul>
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
                      fontWeight: 700,
                      border: '2px solid var(--ink)',
                      padding: '10px 20px',
                      cursor: 'pointer',
                      boxShadow: '2px 2px 0 var(--shadow)',
                    }}
                  >
                    Charger plus
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* MC-2 aside — second child, matching the prototype DOM order. Self-fetching independent
            feed (fetch once on mount). MC-3 wires "Proposer" to the shared invite modal. */}
        <SuggestionsAside
          onProposer={(s) =>
            setInviteTarget({
              userId: s.userId,
              name: s.name,
              avatarUrl: s.avatarUrl,
              subtitle: s.genre ? `${ROLE_LABEL_FR[s.role]} · ${s.genre}` : ROLE_LABEL_FR[s.role],
            })
          }
        />
      </div>

      {inviteTarget && (
        <InviteModal recipient={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </div>
  );
}
