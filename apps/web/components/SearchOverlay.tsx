'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import type { SearchResultType } from '@encre-et-plume/shared';
import { SEARCH_GROUP_LABEL, GROUP_ORDER, totalResults } from '../lib/search';
import { useSearch } from '../lib/useSearch';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Narrows search to one corpus — seam for MC-1 (Contacts) and MC-9 (chat). */
  scope?: SearchResultType;
  /** Placeholder override — scoped variants supply their own text. */
  placeholder?: string;
}

const PLACEHOLDER_DEFAULT = 'Recherchez une œuvre, un·e créateur·rice…';

export default function SearchOverlay({ open, onClose, scope, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const { status, results, error } = useSearch(query, scope);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset query and focus input each time the overlay opens
  useEffect(() => {
    if (open) {
      setQuery('');
      inputRef.current?.focus();
    }
  }, [open]);

  // Focus trap: keep Tab/Shift+Tab inside the panel
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'input, [role="option"], button, a[href]',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Dialog-level keyboard handler: Escape + ArrowDown/Up
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const options = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
        );
        if (!options.length) return;
        const focused = document.activeElement as HTMLElement;
        const isInput = focused === inputRef.current;
        const idx = options.indexOf(focused);
        if (e.key === 'ArrowDown') {
          if (isInput || idx === -1) options[0]?.focus();
          else options[Math.min(idx + 1, options.length - 1)]?.focus();
        } else {
          if (idx <= 0) inputRef.current?.focus();
          else options[idx - 1]?.focus();
        }
      }
    },
    [onClose],
  );

  if (!open) return null;

  const is401 = typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 401;
  const hasResults = totalResults(results) > 0;
  const visibleGroups = GROUP_ORDER.filter((t) => results[t].length > 0);

  return (
    /* Backdrop */
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(22, 19, 15, 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 72,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Rechercher"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          maxWidth: 580,
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 8,
          boxShadow: '6px 6px 0 var(--shadow)',
          overflow: 'hidden',
          margin: '0 16px',
        }}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            borderBottom: '2px solid var(--border)',
          }}
        >
          {/* Search icon */}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink2)"
            strokeWidth="2.5"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            role="combobox"
            aria-label="Rechercher"
            aria-expanded={status === 'ready'}
            aria-controls="search-results"
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? PLACEHOLDER_DEFAULT}
            autoComplete="off"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
            }}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la recherche"
            style={{
              background: 'none',
              border: '1.5px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--ink2)',
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 6px',
              fontFamily: 'var(--font-body)',
              letterSpacing: '0.03em',
              flexShrink: 0,
            }}
          >
            Échap
          </button>
        </div>

        {/* Results area */}
        <div id="search-results" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {/* 401: sign-in prompt */}
          {is401 && (
            <p style={{ padding: '22px 18px', textAlign: 'center', color: 'var(--ink2)', fontSize: 14, margin: 0 }}>
              <Link
                href="/connexion"
                onClick={onClose}
                style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
              >
                Connectez-vous
              </Link>{' '}
              pour rechercher des œuvres, créateur·rices et illustrations.
            </p>
          )}

          {/* Idle prompt */}
          {!is401 && status === 'idle' && (
            <p
              style={{ padding: '22px 18px', color: 'var(--ink2)', fontSize: 14, textAlign: 'center', margin: 0 }}
            >
              Recherchez une œuvre, un·e créateur·rice…
            </p>
          )}

          {/* Loading */}
          {!is401 && status === 'loading' && (
            <p
              role="status"
              aria-live="polite"
              aria-label="Chargement…"
              style={{ padding: '22px 18px', textAlign: 'center', color: 'var(--ink2)', fontSize: 14, margin: 0 }}
            >
              Chargement…
            </p>
          )}

          {/* Generic error */}
          {!is401 && status === 'error' && (
            <p
              role="alert"
              style={{ padding: '22px 18px', textAlign: 'center', color: 'var(--accent)', fontSize: 14, margin: 0 }}
            >
              Une erreur est survenue
            </p>
          )}

          {/* No results */}
          {!is401 && status === 'ready' && !hasResults && (
            <p
              role="status"
              aria-live="polite"
              style={{ padding: '22px 18px', textAlign: 'center', color: 'var(--ink2)', fontSize: 14, margin: 0 }}
            >
              Aucun résultat
            </p>
          )}

          {/* Grouped results */}
          {!is401 && status === 'ready' && hasResults && (
            <div role="listbox" aria-label="Résultats de recherche">
              {visibleGroups.map((type) => (
                <div key={type}>
                  {/* Group heading */}
                  <div
                    style={{
                      padding: '7px 14px 4px',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--ink2)',
                      fontFamily: 'var(--font-display)',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--paper)',
                    }}
                  >
                    {SEARCH_GROUP_LABEL[type]}
                  </div>

                  {results[type].map((item) => (
                    <Link
                      key={item.id}
                      href={item.route}
                      role="option"
                      aria-selected={false}
                      tabIndex={0}
                      onClick={onClose}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border)',
                        textDecoration: 'none',
                        color: 'var(--ink)',
                        fontSize: 14,
                        transition: 'background 0.08s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'var(--paper)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnail}
                          alt=""
                          width={30}
                          height={30}
                          style={{
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                            border: '2px solid var(--border)',
                          }}
                        />
                      ) : (
                        // ponytail: inline halftone avatar fallback — same as Header.tsx AvatarFallback
                        <span
                          aria-hidden="true"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            border: '2px solid var(--border)',
                            background: 'var(--tone)',
                            backgroundImage: 'radial-gradient(var(--ink) 1.4px, transparent 1.5px)',
                            backgroundSize: '5px 5px',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
