'use client';

// MC-8 — "Contacts & connexions" (route /contacts). No prototype frame exists for this screen
// (plan §1 fidelity finding) — built from the story text with the visual language of the nearest
// drawn analogs (TROUVER cards, CANDIDATURES REÇUES accept/refuse rows, INVITATIONS request rows):
// manga-zine tokens, 3px ink borders, hard offset shadows, halftone-dot avatars. Three tabs
// (Contacts / Demandes / Suggestions) over the live GET /contacts, /connections/requests and
// /connections/suggestions endpoints, plus a debounced scoped people search (GET /people/search).
// Presence is embedded server-side in GET /contacts (plan D4); "Message" ships disabled behind an
// MC-9 seam (D5); the "⋯" menu offers "Voir le profil" + "Retirer le contact" (D7).
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  SEARCH_MIN_QUERY_LENGTH,
  type ConnectionRequestItem,
  type ConnectionState,
  type ContactItem,
  type CreatorRole,
  type MatchSuggestion,
  type PeopleSearchItem,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import { relativeTime } from '../../lib/notifications';
import CountBadge from '../CountBadge';

type PanelState = 'loading' | 'ready' | 'error';
type TabKey = 'contacts' | 'demandes' | 'suggestions';

const ROLE_LABEL: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};

const TABS: { key: TabKey; id: string }[] = [
  { key: 'contacts', id: 'contacts' },
  { key: 'demandes', id: 'demandes' },
  { key: 'suggestions', id: 'suggestions' },
];

const SEARCH_DEBOUNCE_MS = 300;

// ─── shared inline styles (manga-zine tokens, replicated from the analog screens) ───────────────

const rowBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 10,
  padding: 14,
  boxShadow: '4px 4px 0 var(--shadow)',
  flexWrap: 'wrap',
};

const avatarStyle = (url: string | null): React.CSSProperties => ({
  width: 48,
  height: 48,
  flex: 'none',
  borderRadius: '50%',
  border: '2px solid var(--ink)',
  background: url
    ? `center/cover url(${url})`
    : 'var(--tone) radial-gradient(var(--ink) 1.4px, transparent 1.5px) 0 0 / 5px 5px',
});

const roleChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  border: '2px solid var(--accent)',
  color: 'var(--accent)',
  borderRadius: 5,
  padding: '1px 8px',
};

const actionBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 13px',
  minHeight: 44,
  background: 'var(--card)',
  color: 'var(--ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};

const primaryBtn = (background: string): React.CSSProperties => ({
  ...actionBtn,
  background,
  color: '#fff',
  boxShadow: '2px 2px 0 var(--shadow)',
});

const retryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: '#fff',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function RoleChip({ role }: { role: CreatorRole | null }) {
  if (!role) return null;
  return <span style={roleChip}>{ROLE_LABEL[role]}</span>;
}

// Presence text — conveyed as words, never colour alone (FE-7). Green dot online, grey offline.
function presenceLine(p: ContactItem['presence']): { text: string; online: boolean } {
  if (p.online) return { text: 'en ligne', online: true };
  if (p.lastSeen) return { text: `vu ${relativeTime(p.lastSeen)}`, online: false };
  return { text: 'hors ligne', online: false };
}

function SkeletonRow() {
  return (
    <li
      aria-hidden="true"
      className="ep-skeleton-delayed"
      style={{ listStyle: 'none', height: 92, border: '3px solid var(--ink)', borderRadius: 10, background: 'var(--tone)', opacity: 0.5 }}
    />
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: '20px 0' }}>
      <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>{message}</p>
      <button type="button" onClick={onRetry} style={retryBtn}>
        Réessayer
      </button>
    </div>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: '28px 0', color: 'var(--ink2)' }}>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>{title}</p>
      {hint && <p style={{ fontSize: 14, margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

function LoadingList({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <ul role="status" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </ul>
  );
}

// ─── Demandes row ────────────────────────────────────────────────────────────────────────────

function RequestRow({
  req,
  onDecide,
}: {
  req: ConnectionRequestItem;
  onDecide: (req: ConnectionRequestItem, status: 'accepted' | 'declined') => void;
}) {
  return (
    <li style={rowBox}>
      <span aria-hidden="true" style={avatarStyle(req.from.avatarUrl)} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/${req.from.slug}`} style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', textDecoration: 'none' }}>
            {req.from.name}
          </Link>
          <RoleChip role={req.from.role} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 4 }}>{req.context}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
        <button
          type="button"
          onClick={() => onDecide(req, 'accepted')}
          aria-label={`Accepter la demande de ${req.from.name}`}
          style={primaryBtn('#1f8a5b')}
        >
          Accepter
        </button>
        <button
          type="button"
          onClick={() => onDecide(req, 'declined')}
          aria-label={`Refuser la demande de ${req.from.name}`}
          style={primaryBtn('var(--accent)')}
        >
          Refuser
        </button>
      </div>
    </li>
  );
}

// ─── Contacts row ────────────────────────────────────────────────────────────────────────────

function ContactRow({
  contact,
  onRemove,
}: {
  contact: ContactItem;
  onRemove: (contact: ContactItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  const { text: presenceText, online } = presenceLine(contact.presence);
  const meta = [contact.city, contact.mutualProjects > 0 ? `${contact.mutualProjects} projet${contact.mutualProjects > 1 ? 's' : ''} en commun` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li style={rowBox}>
      <span aria-hidden="true" style={{ ...avatarStyle(contact.avatarUrl), position: 'relative' }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 13,
            height: 13,
            borderRadius: '50%',
            border: '2px solid var(--card)',
            background: online ? '#1f8a5b' : 'var(--ink2)',
          }}
        />
      </span>

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/${contact.slug}`} style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', textDecoration: 'none' }}>
            {contact.name}
          </Link>
          <RoleChip role={contact.role} />
        </div>
        <div style={{ fontSize: 12, color: online ? '#1f8a5b' : 'var(--ink2)', fontWeight: online ? 700 : 500, marginTop: 4 }}>
          {presenceText}
        </div>
        {meta && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>{meta}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
        {confirming ? (
          <span role="group" aria-label={`Confirmer le retrait de ${contact.name}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => onRemove(contact)} style={primaryBtn('var(--accent)')}>
              Confirmer
            </button>
            <button type="button" onClick={() => setConfirming(false)} style={actionBtn}>
              Annuler
            </button>
          </span>
        ) : (
          <>
            {/* MC-9 seam: messaging isn't built yet — the story-explicit button ships disabled. */}
            <button
              type="button"
              disabled
              aria-label={`Message à ${contact.name}`}
              title="Messagerie bientôt disponible"
              style={{ ...actionBtn, opacity: 0.5, cursor: 'not-allowed' }}
              onClick={() => {
                /* MC-9 seam: dispatch to the floating message widget here. */
              }}
            >
              Message
            </button>
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-label={`Actions pour ${contact.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                style={{ ...actionBtn, padding: '7px 12px', fontSize: 16, lineHeight: 1 }}
              >
                <span aria-hidden="true">⋯</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label={`Actions pour ${contact.name}`}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    zIndex: 20,
                    width: 190,
                    background: 'var(--card)',
                    border: '3px solid var(--ink)',
                    borderRadius: 8,
                    boxShadow: '5px 5px 0 var(--shadow)',
                    overflow: 'hidden',
                  }}
                >
                  <Link
                    href={`/${contact.slug}`}
                    role="menuitem"
                    className="ep-menu-item"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: 'block', padding: '10px 13px', borderBottom: '1.5px solid var(--border)', fontSize: 14, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none' }}
                  >
                    Voir le profil
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="ep-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirming(true);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 13px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--accent)', fontFamily: 'inherit' }}
                  >
                    Retirer le contact
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

// ─── Suggestion card ─────────────────────────────────────────────────────────────────────────

function SuggestionCard({
  item,
  onConnect,
}: {
  item: MatchSuggestion;
  onConnect: (item: MatchSuggestion) => void;
}) {
  const roleLine = item.genre ? `${ROLE_LABEL[item.role]} · ${item.genre}` : ROLE_LABEL[item.role];
  return (
    <li
      style={{
        listStyle: 'none',
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        boxShadow: '5px 5px 0 var(--shadow)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" style={avatarStyle(item.avatarUrl)} />
        <div style={{ minWidth: 0 }}>
          <Link href={`/${item.slug}`} style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', textDecoration: 'none' }}>
            {item.name}
          </Link>
          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{roleLine}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onConnect(item)}
        aria-label={`Se connecter avec ${item.name}`}
        style={{ ...primaryBtn('var(--accent)'), justifyContent: 'center' }}
      >
        ＋ Se connecter
      </button>
    </li>
  );
}

// ─── People-search result row (D12 CTA per connectionState) ────────────────────────────────────

function SearchResultRow({
  item,
  onConnect,
  onRespond,
}: {
  item: PeopleSearchItem;
  onConnect: (item: PeopleSearchItem) => void;
  onRespond: () => void;
}) {
  function cta(state: ConnectionState) {
    switch (state) {
      case 'none':
        return (
          <button type="button" onClick={() => onConnect(item)} aria-label={`Se connecter avec ${item.name}`} style={primaryBtn('var(--accent)')}>
            ＋ Se connecter
          </button>
        );
      case 'pending_out':
        return (
          <button type="button" disabled aria-label={`Demande envoyée à ${item.name}`} style={{ ...actionBtn, opacity: 0.6, cursor: 'default' }}>
            Demande envoyée
          </button>
        );
      case 'pending_in':
        return (
          <button type="button" onClick={onRespond} aria-label={`Répondre à la demande de ${item.name}`} style={actionBtn}>
            Répondre
          </button>
        );
      case 'connected':
        return <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>Déjà en contact</span>;
    }
  }

  return (
    <li style={rowBox}>
      <span aria-hidden="true" style={avatarStyle(item.avatarUrl)} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/${item.slug}`} style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', textDecoration: 'none' }}>
            {item.name}
          </Link>
          <RoleChip role={item.role} />
        </div>
        {item.location && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>{item.location}</div>}
      </div>
      <div style={{ marginLeft: 'auto' }}>{cta(item.connectionState)}</div>
    </li>
  );
}

// ─── Client ────────────────────────────────────────────────────────────────────────────────────

const ulReset: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 16 };

export default function ContactsClient() {
  const { account, loading: sessionLoading } = useSession();

  const [tab, setTab] = useState<TabKey>('contacts');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [requests, setRequests] = useState<ConnectionRequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [incompleteProfile, setIncompleteProfile] = useState(false);

  const [contactsState, setContactsState] = useState<PanelState>('loading');
  const [requestsState, setRequestsState] = useState<PanelState>('loading');
  const [suggestionsState, setSuggestionsState] = useState<PanelState>('loading');

  const [contactsRetry, setContactsRetry] = useState(0);
  const [requestsRetry, setRequestsRetry] = useState(0);
  const [suggestionsRetry, setSuggestionsRetry] = useState(0);

  const [actionError, setActionError] = useState('');
  const [announce, setAnnounce] = useState('');

  // Scoped people search (debounced, auto-applied — repo filter convention).
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<PeopleSearchItem[]>([]);
  const [searchState, setSearchState] = useState<PanelState>('ready');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setContactsState('loading');
    api
      .getContacts()
      .then((res) => {
        if (cancelled) return;
        setContacts(res.items);
        setContactsState('ready');
      })
      .catch(() => !cancelled && setContactsState('error'));
    return () => {
      cancelled = true;
    };
  }, [account, contactsRetry]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setRequestsState('loading');
    api
      .getConnectionRequests()
      .then((res) => {
        if (cancelled) return;
        setRequests(res.items);
        setRequestsState('ready');
      })
      .catch(() => !cancelled && setRequestsState('error'));
    return () => {
      cancelled = true;
    };
  }, [account, requestsRetry]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setSuggestionsState('loading');
    api
      .getConnectionSuggestions()
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.items);
        setIncompleteProfile(res.incompleteProfile);
        setSuggestionsState('ready');
      })
      .catch(() => !cancelled && setSuggestionsState('error'));
    return () => {
      cancelled = true;
    };
  }, [account, suggestionsRetry]);

  // Debounce the search query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const searching = debouncedQuery.trim().length >= SEARCH_MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!account) return;
    const q = debouncedQuery.trim();
    if (q.length < SEARCH_MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearchState('loading');
    api
      .searchPeople(q)
      .then((res) => {
        if (cancelled) return;
        setResults(res.items);
        setSearchState('ready');
      })
      .catch(() => !cancelled && setSearchState('error'));
    return () => {
      cancelled = true;
    };
  }, [account, debouncedQuery]);

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

  // ── mutations (optimistic with rollback + a single live alert) ──

  function decideRequest(req: ConnectionRequestItem, status: 'accepted' | 'declined') {
    setActionError('');
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    if (status === 'accepted') {
      const newContact: ContactItem = {
        userId: req.from.userId,
        slug: req.from.slug,
        name: req.from.name,
        avatarUrl: req.from.avatarUrl,
        role: req.from.role,
        city: null,
        mutualProjects: 0,
        presence: { online: false, lastSeen: null },
      };
      setContacts((prev) => (prev.some((c) => c.userId === newContact.userId) ? prev : [...prev, newContact]));
      setAnnounce(`${req.from.name} a rejoint vos contacts.`);
    } else {
      setAnnounce(`Demande de ${req.from.name} refusée.`);
    }
    api.decideConnectionRequest(req.id, status).catch(() => {
      setRequests((prev) => [req, ...prev]);
      if (status === 'accepted') setContacts((prev) => prev.filter((c) => c.userId !== req.from.userId));
      setActionError('Action impossible. Veuillez réessayer.');
    });
  }

  function removeContact(contact: ContactItem) {
    setActionError('');
    setContacts((prev) => prev.filter((c) => c.userId !== contact.userId));
    setAnnounce(`${contact.name} retiré·e de vos contacts.`);
    api.removeContact(contact.userId).catch(() => {
      setContacts((prev) => (prev.some((c) => c.userId === contact.userId) ? prev : [...prev, contact]));
      setActionError('Retrait impossible. Veuillez réessayer.');
    });
  }

  function connectSuggestion(item: MatchSuggestion) {
    setActionError('');
    setSuggestions((prev) => prev.filter((s) => s.userId !== item.userId));
    setAnnounce(`Demande envoyée à ${item.name}.`);
    api.sendConnectionRequest(item.userId).catch(() => {
      setSuggestions((prev) => (prev.some((s) => s.userId === item.userId) ? prev : [item, ...prev]));
      setActionError('Demande impossible. Veuillez réessayer.');
    });
  }

  function connectSearchResult(item: PeopleSearchItem) {
    setActionError('');
    setResults((prev) => prev.map((r) => (r.userId === item.userId ? { ...r, connectionState: 'pending_out' } : r)));
    setAnnounce(`Demande envoyée à ${item.name}.`);
    api.sendConnectionRequest(item.userId).catch(() => {
      setResults((prev) => prev.map((r) => (r.userId === item.userId ? { ...r, connectionState: 'none' } : r)));
      setActionError('Demande impossible. Veuillez réessayer.');
    });
  }

  if (sessionLoading) {
    return <div aria-busy="true" style={{ minHeight: 300 }} />;
  }

  if (!account) {
    return (
      <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, textTransform: 'uppercase', margin: '0 0 10px' }}>Contacts &amp; connexions</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15, marginBottom: 20 }}>
          Connectez-vous pour retrouver vos contacts et vos demandes de connexion.
        </p>
        <Link
          href="/connexion?redirect=/contacts"
          style={{ display: 'inline-block', fontSize: 14, fontWeight: 700, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '10px 20px', textDecoration: 'none' }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const contactsCount = contacts.length;
  const demandesCount = requests.length;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Live regions */}
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: '0 0 6px' }}>Contacts &amp; connexions</h1>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 18 }}>
        Votre réseau : contacts, demandes de connexion et suggestions.
      </div>

      {/* Actions row: Ajouter un contact + scoped people search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => searchInputRef.current?.focus()}
          style={{ ...primaryBtn('var(--accent)'), whiteSpace: 'nowrap' }}
        >
          ＋ Ajouter un contact
        </button>
        <input
          ref={searchInputRef}
          type="search"
          aria-label="Rechercher des personnes"
          placeholder="nom, rôle, genre, région…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            minHeight: 44,
            border: '2px solid var(--ink)',
            borderRadius: 6,
            padding: '9px 13px',
            fontSize: 14,
            fontFamily: 'inherit',
            background: 'var(--card)',
            color: 'var(--ink)',
          }}
        />
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Contacts et connexions"
        style={{ display: 'flex', gap: 18, borderBottom: '2px solid var(--border)', marginBottom: 20, flexWrap: 'wrap', overflowX: 'auto' }}
      >
        {TABS.map((t, i) => {
          const isActive = tab === t.key;
          const label =
            t.key === 'contacts'
              ? `Contacts · ${contactsCount}`
              : t.key === 'demandes'
                ? 'Demandes'
                : 'Suggestions';
          return (
            <button
              key={t.key}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              aria-label={t.key === 'demandes' ? (demandesCount > 0 ? `Demandes, ${demandesCount} en attente` : 'Demandes') : undefined}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              onClick={() => setTab(t.key)}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: -2,
                padding: '0 0 10px',
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                textTransform: 'uppercase',
                color: isActive ? 'var(--ink)' : 'var(--ink2)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: 44,
              }}
            >
              {label}
              {t.key === 'demandes' && <CountBadge count={demandesCount} label={`${demandesCount} demandes en attente`} />}
            </button>
          );
        })}
      </div>

      {actionError && (
        <p role="alert" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13, margin: '0 0 14px' }}>
          {actionError}
        </p>
      )}

      {/* Scoped search results replace the active panel while a query is live. */}
      {searching ? (
        <section aria-label="Résultats de recherche">
          {searchState === 'loading' && <LoadingList label="Recherche en cours…" rows={2} />}
          {searchState === 'error' && <ErrorPanel message="Recherche impossible." onRetry={() => setDebouncedQuery((q) => `${q} `.trim())} />}
          {searchState === 'ready' &&
            (results.length === 0 ? (
              <EmptyPanel title="Aucune personne trouvée" hint="Essayez un autre nom, rôle, genre ou région." />
            ) : (
              <ul style={ulReset}>
                {results.map((item) => (
                  <SearchResultRow
                    key={item.userId}
                    item={item}
                    onConnect={connectSearchResult}
                    onRespond={() => {
                      // Clear the query (and its debounced source) so `searching` flips off and
                      // the Demandes tab actually becomes visible — otherwise the search panel
                      // stays mounted over it and "Répondre" looks like a no-op.
                      setQuery('');
                      setDebouncedQuery('');
                      setTab('demandes');
                    }}
                  />
                ))}
              </ul>
            ))}
        </section>
      ) : (
        <>
          <div id="tabpanel-contacts" role="tabpanel" aria-labelledby="tab-contacts" hidden={tab !== 'contacts'}>
            {tab === 'contacts' &&
              (contactsState === 'loading' ? (
                <LoadingList label="Chargement de vos contacts…" />
              ) : contactsState === 'error' ? (
                <ErrorPanel message="Impossible de charger vos contacts." onRetry={() => setContactsRetry((k) => k + 1)} />
              ) : contacts.length === 0 ? (
                <EmptyPanel title="Aucun contact" hint="Ajoutez des personnes depuis la recherche ou les suggestions." />
              ) : (
                <ul style={ulReset}>
                  {contacts.map((c) => (
                    <ContactRow key={c.userId} contact={c} onRemove={removeContact} />
                  ))}
                </ul>
              ))}
          </div>

          <div id="tabpanel-demandes" role="tabpanel" aria-labelledby="tab-demandes" hidden={tab !== 'demandes'}>
            {tab === 'demandes' &&
              (requestsState === 'loading' ? (
                <LoadingList label="Chargement des demandes…" />
              ) : requestsState === 'error' ? (
                <ErrorPanel message="Impossible de charger les demandes." onRetry={() => setRequestsRetry((k) => k + 1)} />
              ) : requests.length === 0 ? (
                <EmptyPanel title="Aucune demande" hint="Les demandes de connexion reçues apparaîtront ici." />
              ) : (
                <ul style={ulReset}>
                  {requests.map((r) => (
                    <RequestRow key={r.id} req={r} onDecide={decideRequest} />
                  ))}
                </ul>
              ))}
          </div>

          <div id="tabpanel-suggestions" role="tabpanel" aria-labelledby="tab-suggestions" hidden={tab !== 'suggestions'}>
            {tab === 'suggestions' &&
              (suggestionsState === 'loading' ? (
                <LoadingList label="Chargement des suggestions…" />
              ) : suggestionsState === 'error' ? (
                <ErrorPanel message="Impossible de charger les suggestions." onRetry={() => setSuggestionsRetry((k) => k + 1)} />
              ) : suggestions.length === 0 ? (
                <EmptyPanel
                  title="Aucune suggestion"
                  hint={incompleteProfile ? 'Complétez votre profil pour recevoir des suggestions.' : 'Revenez bientôt pour de nouvelles suggestions.'}
                />
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                  {suggestions.map((s) => (
                    <SuggestionCard key={s.userId} item={s} onConnect={connectSuggestion} />
                  ))}
                </ul>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
