'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { GENRES, resolveGenre } from '@encre-et-plume/shared';

// F-20 — Vocabulary-restricted genre input, shared by the profile tag cloud
// (ProfileTags) and the "recherche active" genre picker (ProfilePageClient).
// Round 1b (user UX refinements): replaced the native <datalist> with a
// custom, on-brand suggestion dropdown (design tokens, role="listbox"/"option"
// a11y pattern — same shape as SearchOverlay/Header's dropdowns), and added
// blur-commit (unfocusing validates/adds a resolvable value, same path as
// Enter; a non-matching value is cleared, no tag created).
type Props = {
  onAdd: (canonicalFr: string) => void;
  onCancel: () => void;
  ariaLabel: string;
  placeholder?: string;
  /** Backspace on an empty input removes the previous chip (parity with the hashtag filter). */
  onRemoveLast?: () => void;
};

const MAX_SUGGESTIONS = 8;

/** NFD fold: strips diacritics, lowercases, trims — mirrors the shared matcher's
 * fold rule (packages/shared/src/genres.ts) for live substring filtering. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

export default function GenreSuggestInput({ onAdd, onCancel, ariaLabel, placeholder, onRemoveLast }: Props) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const query = fold(value);
  const filtered = query
    ? GENRES.filter((g) => fold(g.fr).includes(query) || fold(g.en).includes(query)).slice(
        0,
        MAX_SUGGESTIONS
      )
    : [];

  // Close the dropdown on outside click (same pattern as Header.tsx's menu).
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function selectOption(fr: string) {
    onAdd(fr);
    setValue('');
    setOpen(false);
    setHighlight(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!filtered.length) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      if (!filtered.length) return;
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) {
        selectOption(filtered[highlight].fr);
        return;
      }
      const fr = resolveGenre(value);
      if (fr) selectOption(fr);
      // Non-matching value: reject silently, keep focus + current text.
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      setOpen(false);
      onCancel();
    } else if (e.key === 'Backspace' && value === '' && onRemoveLast) {
      // Backspace on an empty input deletes the previous chip.
      e.preventDefault();
      onRemoveLast();
    }
  }

  // Blur commits the same way Enter does: a resolvable value is added, a
  // non-matching one is cleared without creating a tag.
  function handleBlur() {
    const fr = resolveGenre(value);
    if (fr) onAdd(fr);
    setValue('');
    setOpen(false);
    onCancel();
  }

  const showDropdown = open && filtered.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <input
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown ? `${listboxId}-${highlight}` : undefined}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setHighlight(0);
          setOpen(next.trim() !== '');
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label={ariaLabel}
        style={{
          border: '2px solid var(--accent)',
          borderRadius: 5,
          padding: '4px 10px',
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--card)',
          color: 'var(--ink)',
          width: 120,
          outline: 'none',
        }}
      />
      {showDropdown && (
        <ul
          role="listbox"
          id={listboxId}
          aria-label={`Suggestions pour ${ariaLabel}`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 60,
            minWidth: 160,
            maxHeight: 220,
            overflowY: 'auto',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            boxShadow: '3px 3px 0 var(--shadow)',
          }}
        >
          {filtered.map((g, i) => (
            <li
              key={g.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              // mousedown (not click) + preventDefault: keeps the input focused so
              // the blur-commit handler never fires and rejects this selection.
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(g.fr);
              }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '6px 10px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: i === highlight ? 'var(--accent)' : 'transparent',
                color: i === highlight ? '#fff' : 'var(--ink)',
              }}
            >
              {g.fr}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
