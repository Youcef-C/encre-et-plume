'use client';

// CS-12 — "Mes projets" dashboard (route /projets). Replica of prototype data-page="dashboard"
// (.dc.html 1266–1289): h1 "Mes projets", derived summary line, "＋ Nouveau projet", status filter
// chips (Tous/En cours/En pause/Publiés), and one full-width card per project AND per illustration
// collection. Induced additions (D1, user-specified 2026-07-09): a debounced URL-synced title search
// (Galerie pattern) and collection rows that deep-link to DR-12's /collection/:id/gerer manage view.
// No-emoji rule (D2): role glyphs use BrushIcon/PenNibIcon, not the prototype's 🖌/✒. No progress bar
// (D3): no data source until CS-2/CS-7.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PROJECT_STATUS_FILTERS,
  PROJECT_TYPE_FILTERS,
  type CollectionItemDto,
  type CreatorRole,
  type MyProjectItem,
  type MyProjectsSummary,
  type ProjectStatusFilter,
  type ProjectTypeFilter,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { getMyProjects, getCollection } from '../../lib/api';
import { BrushIcon, CaretDownIcon, ImageIcon, LayersIcon, PenNibIcon, SearchIcon } from '../icons';

type Screen = 'loading' | 'ready' | 'error';

const RoleIcon = { scenariste: PenNibIcon, dessinateur: BrushIcon };

const STATUS_CHIPS: { key: ProjectStatusFilter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'en-cours', label: 'En cours' },
  { key: 'en-pause', label: 'En pause' },
  { key: 'publies', label: 'Publiés' },
];

// Induced (D6): the type filter isn't drawn in the prototype — same chip look/tokens as the status row.
// Five chips matching the backend enum: Illustrations (all illustrations flat, incl. collected ones) is
// distinct from Collections (only collections, expandable).
const TYPE_CHIPS: { key: ProjectTypeFilter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'manga', label: 'Manga' },
  { key: 'histoire', label: 'Histoire' },
  { key: 'illustrations', label: 'Illustrations' },
  { key: 'collections', label: 'Collections' },
];

const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
const frDate = (iso: string) => dateFmt.format(new Date(iso));

const SEARCH_DEBOUNCE_MS = 350;

function parseStatut(v: string | null): ProjectStatusFilter {
  return (PROJECT_STATUS_FILTERS as readonly string[]).includes(v ?? '')
    ? (v as ProjectStatusFilter)
    : 'tous';
}

function parseType(v: string | null): ProjectTypeFilter {
  return (PROJECT_TYPE_FILTERS as readonly string[]).includes(v ?? '')
    ? (v as ProjectTypeFilter)
    : 'tous';
}

// Shared chip-row renderer — the status and type rows are identical controls (same tokens, aria).
function ChipRow<T extends string>({
  label,
  chips,
  active,
  onChoose,
}: {
  label: string;
  chips: { key: T; label: string }[];
  active: T;
  onChoose: (key: T) => void;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13, fontWeight: 700 }}>
      {chips.map(({ key, label: chipLabel }) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChoose(key)}
            style={{
              background: on ? 'var(--accent)' : 'var(--card)',
              color: on ? '#fff' : 'var(--ink)',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '5px 12px',
              minHeight: 44,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {chipLabel}
          </button>
        );
      })}
    </div>
  );
}

// --- badges & slabs ------------------------------------------------------------------------------

const halftoneCover: React.CSSProperties = {
  width: 56,
  height: 74,
  flex: 'none',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  backgroundColor: 'var(--accent)',
  backgroundImage:
    'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(150deg,var(--ink) 42%,var(--accent) 42%)',
  backgroundSize: 'var(--dot) var(--dot),cover',
};

const badgeBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  // "En révision" reads as an accent outline; everything else fills accent (prototype).
  if (status === 'en révision') {
    return (
      <span style={{ ...badgeBase, background: 'var(--card)', color: 'var(--accent)', border: '2px solid var(--accent)' }}>
        {label}
      </span>
    );
  }
  if (status === 'en pause') {
    return <span style={{ ...badgeBase, background: 'var(--card)', color: 'var(--ink2)' }}>{label}</span>;
  }
  return <span style={{ ...badgeBase, background: 'var(--accent)', color: '#fff' }}>{label}</span>;
}

function RoleGlyph({ role }: { role: CreatorRole | null }) {
  if (!role) return null;
  const Icon = RoleIcon[role];
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', verticalAlign: 'middle', margin: '0 1px', color: 'var(--ink2)' }}>
      <Icon size={12} />
    </span>
  );
}

// Meta line: projects → "Avec {name}{icon} · vous {icon} · étape : {step}"; collections →
// "Solo · vous {icon} · N illustrations". "Solo" when no collaborators; "étape :" omitted when null.
function MetaLine({ item, count }: { item: MyProjectItem; count: number | null }) {
  // Dashboard fields are optional in the shared type (legacy picker returns bare rows) but always
  // populated for scope='all' — default defensively so TS is happy and empty rows never crash.
  const members = item.members ?? [];
  const self = members.find((m) => m.self);
  const others = members.filter((m) => !m.self);

  const segments: React.ReactNode[] = [];
  if (others.length > 0) {
    segments.push(
      <span key="with">
        Avec{' '}
        {others.map((o, i) => (
          <span key={o.id}>
            {i > 0 ? ', ' : ''}
            {o.name}
            <RoleGlyph role={o.role} />
          </span>
        ))}
      </span>,
    );
  } else {
    segments.push(<span key="solo">Solo</span>);
  }
  segments.push(
    <span key="you">
      vous
      <RoleGlyph role={self?.role ?? null} />
    </span>,
  );
  if (item.kind === 'collection' && count != null) {
    segments.push(<span key="count">{count} illustrations</span>);
  } else if (item.step) {
    segments.push(<span key="step">étape : {item.step}</span>);
  }

  return (
    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4 }}>
      {segments.map((s, i) => (
        <span key={i}>
          {i > 0 ? ' · ' : ''}
          {s}
        </span>
      ))}
    </div>
  );
}

const actionBase: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '10px 16px',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  textDecoration: 'none',
  fontFamily: 'inherit',
};
const primaryActionStyle: React.CSSProperties = {
  ...actionBase,
  background: 'var(--ink)',
  color: 'var(--paper)',
  boxShadow: '2px 2px 0 var(--accent)',
};
const secondaryActionStyle: React.CSSProperties = {
  ...actionBase,
  background: 'var(--card)',
  color: 'var(--ink)',
};

type MembersState = 'loading' | 'ready' | 'error';

// A collection member (DR-12 detail) → the same MyProjectItem shape as an uncollected illustration, so
// it renders through ProjectCard identically ("Illustration" badge, ImageIcon, Voir/Modifier actions).
function memberToItem(m: CollectionItemDto): MyProjectItem {
  return {
    id: m.id,
    title: m.title,
    meta: '',
    cover: m.thumbnail,
    slug: null,
    type: 'illustration',
    status: null,
    members: [],
    step: null,
    nextReleaseAt: null,
    kind: 'illustration',
    illustrationCount: null,
  };
}

// The expanded members region: a nested, contained block of FULL illustration cards (not thumbnails),
// clearly children of the parent collection card. Fetch/cache live in ProjectCard.
function CollectionMembers({
  regionId,
  state,
  members,
  onRetry,
}: {
  regionId: string;
  state: MembersState;
  members: CollectionItemDto[];
  onRetry: () => void;
}) {
  // Subtle containment (design polish): no fill, no ink contour, no inset shadow, no vertical connector
  // bar. Containment reads from the indent + the parent card's darker expanded background + its elevation.
  const nest: React.CSSProperties = {
    marginTop: 14,
    marginLeft: 20,
    paddingLeft: 4,
  };

  let body: React.ReactNode;
  if (state === 'loading') {
    body = (
      <div role="status" style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 500 }}>
        Chargement des illustrations…
      </div>
    );
  } else if (state === 'error') {
    body = (
      <div role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
        Impossible de charger les illustrations.{' '}
        <button type="button" onClick={onRetry} style={{ ...secondaryActionStyle, minHeight: 36, padding: '6px 12px', marginLeft: 6, fontSize: 12 }}>
          Réessayer
        </button>
      </div>
    );
  } else if (members.length === 0) {
    body = <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Aucune illustration dans cette collection</div>;
  } else {
    body = (
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {members.map((m) => (
          <ProjectCard key={m.id} item={memberToItem(m)} variant="nested" />
        ))}
      </ul>
    );
  }

  return (
    <div id={regionId} data-testid="collection-nested" style={nest}>
      {body}
    </div>
  );
}

function ProjectCard({ item, variant = 'default' }: { item: MyProjectItem; variant?: 'default' | 'nested' }) {
  const nested = variant === 'nested';
  // "Modifier" opens the editor surface; "Voir" opens the public page. Routes differ per kind:
  // illustration → /illustration/{id}(/modifier) even though slug is null; collection → manage view +
  // /oeuvre/{slug}; project → workspace + /oeuvre/{slug}. Voir is omitted only when there's no URL.
  let editHref: string;
  let publicHref: string | null;
  if (item.kind === 'illustration') {
    editHref = `/illustration/${item.id}/modifier`;
    publicHref = `/illustration/${item.id}`;
  } else if (item.kind === 'collection') {
    editHref = `/collection/${item.id}/gerer`;
    publicHref = item.slug ? `/oeuvre/${item.slug}` : null;
  } else {
    editHref = `/projet/${item.slug ?? item.id}`;
    publicHref = item.slug ? `/oeuvre/${item.slug}` : null;
  }
  // Type badge label: collection → "Illustration(s)", standalone illustration → "Illustration", else the
  // project's own type ("Manga" / "Histoire").
  const typeBadge =
    item.kind === 'collection' ? 'Illustration(s)' : item.kind === 'illustration' ? 'Illustration' : item.type;
  const release = item.nextReleaseAt ? `sortie ${frDate(item.nextReleaseAt)}` : 'pas de sortie programmée';

  const isCollection = item.kind === 'collection';
  const [expanded, setExpanded] = useState(false);
  const regionId = `coll-${item.id}-members`;

  // Lazy-fetched member cache. `null` = never fetched; once loaded it survives collapse/expand (no refetch).
  const [members, setMembers] = useState<CollectionItemDto[] | null>(null);
  const [membersState, setMembersState] = useState<MembersState>('loading');

  const loadMembers = useCallback(() => {
    setMembersState('loading');
    getCollection(item.id)
      .then((d) => {
        setMembers(d.items);
        setMembersState('ready');
      })
      .catch(() => setMembersState('error'));
  }, [item.id]);

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    // Lazy fetch on first open (or after an error). Cached once loaded → re-expand never refetches.
    if (next && members === null) loadMembers();
  }

  // Clicking anywhere on a collection card body toggles it too — but not when the click lands on an
  // interactive child (the caret button, Modifier/Voir links). Keyboard users still use the caret button.
  function onCardBodyClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('a, button')) return;
    toggleExpand();
  }

  // Count = server count, falling back to the fetched member count if the row somehow lacked it.
  const count = item.illustrationCount ?? members?.length ?? null;

  // Kind glyph next to the badge: a stack for a collection ("a set"), a single frame for one piece.
  const KindGlyph = isCollection ? LayersIcon : item.kind === 'illustration' ? ImageIcon : null;
  const kindGlyphTestId = isCollection ? 'kind-glyph-collection' : 'kind-glyph-illustration';

  return (
    <li
      className="ep-projet-card"
      data-expanded={expanded ? 'true' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Expanded collection = the active/selected card → a subtle step darker than the card surface
        // (small ink mix, NOT heavy beige). Collapsed collections and everything else stay normal.
        background: expanded ? 'color-mix(in srgb, var(--card) 94%, var(--ink))' : 'var(--card)',
        // Nested member cards read calmer: a hairline light border and no hard offset shadow. Top-level
        // cards keep the bold 3px ink border + hard shadow.
        border: nested ? '1.5px solid var(--border)' : '3px solid var(--ink)',
        borderRadius: 10,
        padding: nested ? 12 : 14,
        // When expanded the collection is the visual parent of its member cards: it sits above them
        // (relative + z-index) with a stronger hard offset shadow. The default (collapsed, non-nested)
        // shadow + hover lift live in the `.ep-projet-card` CSS class so `:hover` can grow the shadow
        // (an inline box-shadow can't be overridden by a stylesheet `:hover`).
        position: expanded ? 'relative' : undefined,
        zIndex: expanded ? 1 : undefined,
        boxShadow: nested ? 'none' : expanded ? '6px 6px 0 var(--shadow)' : undefined,
      }}
    >
      <div
        className="ep-projet-card-row"
        onClick={isCollection ? onCardBodyClick : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: isCollection ? 'pointer' : undefined }}
      >
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover}
            alt=""
            width={56}
            height={74}
            style={{ width: 56, height: 74, flex: 'none', objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 5 }}
          />
        ) : (
          <div aria-hidden="true" style={halftoneCover} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{item.title}</b>
            {KindGlyph && (
              <span data-testid={kindGlyphTestId} aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--ink2)' }}>
                <KindGlyph size={15} />
              </span>
            )}
            <span style={badgeBase}>{typeBadge}</span>
            {/* Status badge is series-only: illustration/collection rows report status:null → no badge. */}
            {item.status && <StatusBadge status={item.status} />}
          </div>
          <MetaLine item={item} count={count} />
          <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 6 }}>{release}</div>
        </div>

        <div
          className="ep-projet-card-actions"
          style={{ display: 'flex', gap: 8, flex: 'none', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}
        >
          {isCollection && (
            // Expand pill: a VISIBLE text label + a rotating caret so it's inherently wider than tall
            // (never an icon-only square). Same tokens/height as Voir/Modifier; accent fill on hover.
            <button
              type="button"
              className="ep-projet-expand"
              aria-expanded={expanded}
              aria-controls={expanded ? regionId : undefined}
              onClick={toggleExpand}
              aria-label={expanded ? `Masquer les illustrations de ${item.title}` : `Voir les illustrations de ${item.title}`}
              style={{ ...secondaryActionStyle, gap: 6, padding: '10px 14px', cursor: 'pointer' }}
            >
              Illustrations
              <span
                aria-hidden="true"
                style={{ display: 'inline-flex', transition: 'transform .15s ease', transform: expanded ? 'rotate(180deg)' : 'none' }}
              >
                <CaretDownIcon size={16} />
              </span>
            </button>
          )}
          <Link href={editHref} aria-label={`Modifier ${item.title}`} className="ep-projet-open" style={primaryActionStyle}>
            Modifier
          </Link>
          {publicHref && (
            <Link href={publicHref} aria-label={`Voir ${item.title}`} style={secondaryActionStyle}>
              Voir
            </Link>
          )}
        </div>
      </div>

      {/* Lazy members strip — mounted once opened, hidden (not unmounted) when collapsed → stays cached. */}
      {isCollection && expanded && (
        <CollectionMembers regionId={regionId} state={membersState} members={members ?? []} onRetry={loadMembers} />
      )}
    </li>
  );
}

function SkeletonCard() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{ listStyle: 'none', height: 104, border: '3px solid var(--ink)', borderRadius: 10, background: 'var(--tone)', opacity: 0.5 }}
    />
  );
}

function summaryLine(summary: MyProjectsSummary | undefined): string {
  if (!summary) return '';
  const segs: string[] = [];
  if (summary.active > 0) segs.push(`${summary.active} actif${summary.active > 1 ? 's' : ''}`);
  if (summary.enRevision > 0) segs.push(`${summary.enRevision} en révision`);
  if (summary.nextReleaseAt) segs.push(`prochaine sortie ${frDate(summary.nextReleaseAt)}`);
  return segs.join(' · ');
}

const newProjectBtn: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'var(--accent)',
  color: '#fff',
  border: '3px solid var(--ink)',
  borderRadius: 6,
  padding: '11px 20px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '3px 3px 0 var(--shadow)',
  fontFamily: 'inherit',
  minHeight: 44,
};

export default function ProjetsClient() {
  const { account, loading: sessionLoading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<ProjectStatusFilter>(() => parseStatut(searchParams.get('statut')));
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>(() => parseType(searchParams.get('type')));
  const [q, setQ] = useState(() => searchParams.get('q') ?? '');
  const [searchText, setSearchText] = useState(q);

  const [items, setItems] = useState<MyProjectItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<MyProjectsSummary | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>('loading');
  const [retryKey, setRetryKey] = useState(0);

  // Reflect the active filters/search into the URL (deep-link + back/forward) without a fetch.
  const syncUrl = useCallback(
    (nextQ: string, nextStatut: ProjectStatusFilter, nextType: ProjectTypeFilter) => {
      const p = new URLSearchParams();
      if (nextQ) p.set('q', nextQ);
      if (nextStatut !== 'tous') p.set('statut', nextStatut);
      if (nextType !== 'tous') p.set('type', nextType);
      const qs = p.toString();
      router.replace(`/projets${qs ? `?${qs}` : ''}`);
    },
    [router],
  );

  // Debounced search — auto-applies ~350ms after the last keystroke (Galerie/DR-5 pattern), no submit.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = searchText.trim();
      if (next !== q) {
        setQ(next);
        syncUrl(next, filter, typeFilter);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const chooseStatus = useCallback(
    (next: ProjectStatusFilter) => {
      setFilter(next);
      syncUrl(q, next, typeFilter);
    },
    [q, typeFilter, syncUrl],
  );

  const chooseType = useCallback(
    (next: ProjectTypeFilter) => {
      setTypeFilter(next);
      syncUrl(q, filter, next);
    },
    [q, filter, syncUrl],
  );

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setScreen('loading');
    getMyProjects({ scope: 'all', q: q || undefined, status: filter, type: typeFilter, page: 1 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total ?? res.items.length);
        setPage(res.page ?? 1);
        setSummary(res.summary);
        setScreen('ready');
      })
      .catch(() => {
        if (!cancelled) setScreen('error');
      });
    return () => {
      cancelled = true;
    };
  }, [account, q, filter, typeFilter, retryKey]);

  async function loadMore() {
    const res = await getMyProjects({ scope: 'all', q: q || undefined, status: filter, type: typeFilter, page: page + 1 });
    setItems((prev) => [...prev, ...res.items]);
    setPage(res.page ?? page + 1);
    setTotal(res.total ?? total);
  }

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>
          Mes projets
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour retrouver vos projets et vos collections.
        </p>
        <Link
          href="/connexion?redirect=/projets"
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

  const isFiltered = !!q || filter !== 'tous' || typeFilter !== 'tous';
  const line = summaryLine(summary);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Header row (prototype 1268) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
          Mes projets
        </h1>
        <button type="button" onClick={() => router.push('/creer')} style={newProjectBtn}>
          ＋ Nouveau projet
        </button>
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginBottom: 20, minHeight: 18 }}>{line}</div>

      {/* Filters (search + status + type; all flex-wrap). Search + type are induced — D1/D6. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
              color: 'var(--ink2)',
              background: 'var(--card)',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '7px 11px',
              fontWeight: 500,
              minWidth: 200,
              flex: '1 1 240px',
              maxWidth: 340,
              minHeight: 44,
            }}
          >
            <SearchIcon size={14} />
            <input
              aria-label="Rechercher un projet…"
              placeholder="Rechercher un projet…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: 13, color: 'inherit', font: 'inherit' }}
            />
          </div>
          <ChipRow label="Filtrer par statut" chips={STATUS_CHIPS} active={filter} onChoose={chooseStatus} />
        </div>
        <ChipRow label="Filtrer par type" chips={TYPE_CHIPS} active={typeFilter} onChoose={chooseType} />
      </div>

      {screen === 'loading' && (
        <ul
          role="status"
          aria-label="Chargement de vos projets…"
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </ul>
      )}

      {screen === 'error' && (
        <div role="alert" style={{ padding: '20px 0' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>Impossible de charger vos projets.</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {screen === 'ready' && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink2)' }}>
          {isFiltered ? (
            <div style={{ fontSize: 15, fontWeight: 700 }}>Aucun résultat</div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Aucun projet — créez-en un</div>
              <button type="button" onClick={() => router.push('/creer')} style={{ ...newProjectBtn, marginLeft: 0 }}>
                ＋ Nouveau projet
              </button>
            </>
          )}
        </div>
      )}

      {screen === 'ready' && items.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {items.map((item) => (
              <ProjectCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button
                type="button"
                onClick={loadMore}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'var(--card)',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '10px 20px',
                  cursor: 'pointer',
                  boxShadow: '2px 2px 0 var(--shadow)',
                  fontFamily: 'inherit',
                }}
              >
                Charger plus
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
