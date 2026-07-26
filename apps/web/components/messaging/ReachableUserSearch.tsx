'use client';

// MC-13 — shared reachable-user search input: THE one people-picker idiom (contacts OR anyone
// reachable, never a native select and never a contacts dropdown). Reused by NewConversationModal
// ("Nouvelle conversation"), GroupMembersPanel ("Ajouter un membre") and InviteModal ("Proposer une
// collab"). Mirrors the NewProjectWizard invite-search UI pattern:
// a controlled, debounced text input → GET /accounts/search?q= → an on-brand combobox/listbox with
// ↑/↓/Enter/Escape keyboard nav (same a11y wiring as the SalonDock mention listbox).
// Picking a row calls onPick and clears the input; the caller filters via `excludeIds`.
// Contacts-DM follow-up (2026-07-26): an EMPTY query is the idle state — it lists the caller's
// contacts under a "Vos contacts" caption, and contacts found by a real query rank first and carry a
// "Contact" tag. That is what keeps contacts one click away now the Contacts dropdown is gone.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReachableUser } from '@encre-et-plume/shared';
import { searchAccounts } from '../../lib/api';

function avatarDisc(url: string | null): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    display: 'block',
    // Halftone-dot fallback when there is no avatar (matches the roster / brand texture).
    background: url
      ? `center/cover url(${url})`
      : 'radial-gradient(var(--ink) 1.4px, transparent 1.5px) 0 0/7px 7px, var(--tone)',
  };
}

export default function ReachableUserSearch({
  excludeIds,
  onPick,
  label,
  placeholder = 'Rechercher par nom…',
}: {
  excludeIds: string[];
  onPick: (user: ReachableUser) => void;
  label: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReachableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const listId = useId();

  const excludeKey = excludeIds.join(',');
  const suggestions = useMemo(
    () => results.filter((r) => !excludeIds.includes(r.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, excludeKey],
  );

  // Debounced search (300ms) — same timing as the wizard. Empty/whitespace = the idle state, which
  // asks the same endpoint for the caller's contacts (one search implementation, one endpoint).
  const q = query.trim();
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      searchAccounts(q)
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  // Keep the active option in range as the suggestion set changes.
  useEffect(() => {
    setActiveIdx((i) => (i >= suggestions.length ? 0 : i));
  }, [suggestions.length]);

  const pick = (u: ReachableUser) => {
    onPick(u);
    // Keep the rows: the caller adds the pick to excludeIds (so it drops out on its own) and clearing
    // the query re-runs the idle contacts fetch. Wiping results here would empty an idle list for good.
    setQuery('');
    setActiveIdx(0);
  };

  // Idle (no query) opens as soon as there are contacts to show; an empty contact book gets the
  // idle hint below instead of a bare "Aucun résultat".
  const open = q.length > 0 || suggestions.length > 0;
  // Keyed on what the SERVER returned, not on `suggestions`: a caller whose excludeIds happen to
  // cover every contact (e.g. all of them already picked as chips) has contacts — saying otherwise
  // would be factually wrong copy.
  const idleEmpty = q.length === 0 && !loading && results.length === 0;
  const active = suggestions[activeIdx];

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) pick(active);
    } else if (e.key === 'Escape') {
      // Nothing typed → nothing to clear. Bail BEFORE touching state: `setQuery('')` is a no-op when
      // the query is already empty, so the fetch effect (keyed on the debounced query) never re-runs,
      // but `setResults([])` would still wipe the idle "Vos contacts" list — permanently, leaving a
      // user who has contacts staring at "Aucun contact pour l'instant". Returning here also lets
      // Escape reach the host modal, which is what a user expects when the field is empty.
      if (query.length === 0) return;
      // Otherwise clear the query without bubbling up and closing the host modal.
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
      setResults([]);
    }
  }

  return (
    <div style={{ border: '2px solid var(--ink)', borderRadius: 8, overflow: 'hidden' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={open && active ? `${listId}-${active.id}` : undefined}
        placeholder={placeholder}
        style={{
          width: '100%',
          border: 'none',
          borderRadius: 0,
          borderBottom: open ? '2px solid var(--border)' : 'none',
          padding: '9px 12px',
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--paper)',
          color: 'var(--ink)',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {idleEmpty && (
        <p style={{ margin: 0, padding: '9px 12px', fontSize: 12, color: 'var(--ink2)', lineHeight: 1.45, background: 'var(--paper)' }}>
          Aucun contact pour l’instant — cherchez un nom ci-dessus.
        </p>
      )}
      {open && q.length === 0 && suggestions.length > 0 && (
        <p aria-hidden="true" style={{ margin: 0, padding: '7px 12px 5px', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.04em', textTransform: 'uppercase', background: 'var(--paper)' }}>
          Vos contacts
        </p>
      )}
      {open && (
        <ul id={listId} role="listbox" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 200, overflow: 'auto' }}>
          {loading && q.length > 0 && (
            <li aria-hidden="true" style={{ padding: '9px 12px', fontSize: 13, color: 'var(--ink2)' }}>
              Recherche…
            </li>
          )}
          {!loading && q.length > 0 && suggestions.length === 0 && (
            <li aria-hidden="true" style={{ padding: '9px 12px', fontSize: 13, color: 'var(--ink2)' }}>
              Aucun résultat
            </li>
          )}
          {suggestions.map((u, i) => (
            <li
              key={u.id}
              id={`${listId}-${u.id}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 12px',
                cursor: 'pointer',
                minHeight: 44,
                background: i === activeIdx ? 'var(--accent)' : 'transparent',
                color: i === activeIdx ? '#fff' : 'var(--ink)',
                borderBottom: '1.5px solid var(--border)',
              }}
            >
              <span aria-hidden="true" style={avatarDisc(u.avatarUrl)} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
              {u.isContact && q.length > 0 && (
                // Ranking made visible: contacts come first in the results, and say so.
                <span
                  style={{
                    flex: 'none',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    border: `1.5px solid ${i === activeIdx ? '#fff' : 'var(--ink)'}`,
                    borderRadius: 999,
                    padding: '1px 7px',
                  }}
                >
                  Contact
                </span>
              )}
              <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 700, opacity: 0.8 }}>
                ＋
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
