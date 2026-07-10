'use client';

// MC-13 — shared reachable-user search input, reused by GroupCreateModal ("Nouveau groupe") and
// GroupMembersPanel ("Ajouter un membre"). Mirrors the NewProjectWizard invite-search UI pattern:
// a controlled, debounced text input → GET /accounts/search?q= → an on-brand combobox/listbox with
// ↑/↓/Enter/Escape keyboard nav (same a11y wiring as the SalonDock mention listbox). Never a native
// select. Picking a row calls onPick and clears the input; the caller filters via `excludeIds`.
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

  // Debounced search (300ms) — same timing as the wizard. Empty/whitespace clears results, no call.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchAccounts(q)
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Keep the active option in range as the suggestion set changes.
  useEffect(() => {
    setActiveIdx((i) => (i >= suggestions.length ? 0 : i));
  }, [suggestions.length]);

  const pick = (u: ReachableUser) => {
    onPick(u);
    setQuery('');
    setResults([]);
    setActiveIdx(0);
  };

  const open = query.trim().length > 0;
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
      // Clear the suggestions without bubbling up to close a host modal.
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
      {open && (
        <ul id={listId} role="listbox" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 200, overflow: 'auto' }}>
          {loading && (
            <li aria-hidden="true" style={{ padding: '9px 12px', fontSize: 13, color: 'var(--ink2)' }}>
              Recherche…
            </li>
          )}
          {!loading && suggestions.length === 0 && (
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
