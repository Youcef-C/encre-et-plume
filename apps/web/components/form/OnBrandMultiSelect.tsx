'use client';

// MC-1 (round 2) — on-brand multi-select: a chip-styled trigger opening a checkbox listbox popover.
// Reused by /trouver (Genres, Localisation) and by MC-4's board filters later. Options are either a
// flat list or grouped (with a `group` header). `searchable` adds an accent-insensitive text filter
// for long lists (the ~270 Localisation options). Auto-applies each toggle via onChange.
// ponytail: checkbox listbox + naive includes filter; virtualize only if it ever lags.
import { useEffect, useId, useRef, useState } from 'react';
import OnBrandCheckbox from './OnBrandCheckbox';
import GenreChip from '../GenreChip';

type Option = { value: string; label: string };
type Group = { group: string; options: Option[] };
type Options = Option[] | Group[];

function isGrouped(options: Options): options is Group[] {
  return options.length > 0 && 'group' in options[0];
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export default function OnBrandMultiSelect({
  label,
  options,
  values,
  onChange,
  searchable = false,
}: {
  label: string;
  options: Options;
  values: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  const groups: Group[] = isGrouped(options) ? options : [{ group: '', options }];
  // value → display label, for the selected-chip row (F-22 GenreChip pattern).
  const labelByValue = new Map(groups.flatMap((g) => g.options).map((o) => [o.value, o.label]));
  const q = fold(query.trim());
  const visibleGroups = q
    ? groups
        .map((g) => ({ ...g, options: g.options.filter((o) => fold(o.label).includes(q)) }))
        .filter((g) => g.options.length > 0)
    : groups;

  const count = values.length;

  const row = (o: Option) => (
    <div key={o.value} style={{ padding: '5px 11px' }}>
      <OnBrandCheckbox
        label={o.label}
        checked={values.includes(o.value)}
        onChange={() => toggle(o.value)}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'inherit',
          border: '2px solid var(--ink)',
          borderRadius: 5,
          padding: '8px 13px',
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          background: count > 0 ? 'var(--accent)' : 'var(--card)',
          color: count > 0 ? '#fff' : 'var(--ink)',
        }}
      >
        {count > 0 ? `${label} (${count})` : label} ▾
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            minWidth: 220,
            maxHeight: 320,
            overflow: 'auto',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            boxShadow: '3px 3px 0 var(--shadow)',
            padding: '6px 0',
          }}
        >
          {/* Selected choices shown as removable chips ON TOP of the list (F-22 GenreChip pattern).
              Kept inside the popover so they never grow the shared filter row and misalign it.
              Removing a chip re-fires onChange → the filter auto-applies. */}
          {values.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                padding: '2px 11px 8px',
                borderBottom: '2px solid var(--ink)',
                marginBottom: 6,
              }}
            >
              {values.map((v) => (
                <GenreChip key={v} label={labelByValue.get(v) ?? v} onRemove={() => toggle(v)} />
              ))}
            </div>
          )}

          {searchable && (
            <div style={{ padding: '2px 11px 8px' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={`Rechercher dans ${label}`}
                placeholder="Rechercher…"
                style={{
                  width: '100%',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '6px 9px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          )}

          {visibleGroups.length === 0 && (
            <p style={{ padding: '6px 11px', fontSize: 13, color: 'var(--ink2)', margin: 0 }}>
              Aucun résultat
            </p>
          )}

          {visibleGroups.map((g) => (
            <div key={g.group || '_'}>
              {g.group && (
                <div
                  style={{
                    padding: '8px 11px 3px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--ink2)',
                  }}
                >
                  {g.group}
                </div>
              )}
              {g.options.map(row)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
