'use client';

// DR-2 FE-4 — "Filtrer" sidebar. Replica of prototype DÉCOUVRIR lines 498-553.
//
// Round 2 (2026-07-03, user-revised — overrides the prototype's drawn facets, see plan.md §8
// R2-4): controlled, immediate-apply sidebar (no more draft + "Appliquer les filtres" button).
// Every interaction calls `onChange(next)` directly; `onReset()` resets to EMPTY_FILTERS.
// TRIER moved to a native <select> at the very top; search auto-applies debounced; GENRE is now
// a full-vocabulary searchbar-to-add-tags picker (GenreSuggestInput + GenreChip, same as the
// profile page); THÈMES is gone; LANGUE drops "Traduit".
// Round 2b: PUBLIC reverted to multi-select — "Tous public" clears both, "Mature"/"+18" toggle
// independently (both selectable at once), matching FORMAT/LANGUE's OR-within semantics.
import { useEffect, useRef, useState } from 'react';
import {
  catalogGenreLabel,
  CATALOG_FORMATS,
  CATALOG_LANGUAGES,
  CATALOG_STATUTS,
  CATALOG_LONGUEURS,
  CATALOG_TRIS,
  CATALOG_PUBLICS,
  resolveGenreId,
  type CatalogQuery,
} from '@encre-et-plume/shared';
import { STATUT_LABELS, LONGUEUR_LABELS, TRI_LABELS, PUBLIC_LABELS, PUBLIC_ALL_LABEL } from '../../lib/catalog';
import { SearchIcon, CheckIcon, CircleIcon, CircleDotIcon } from '../icons';
import GenreSuggestInput from '../GenreSuggestInput';
import GenreChip from '../GenreChip';
import OnBrandSelect from '../form/OnBrandSelect';

const SEARCH_DEBOUNCE_MS = 350;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ChipToggle({ label, selected, small, onClick }: { label: string; selected: boolean; small?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="ep-chip-toggle"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: small ? 12 : 13,
        fontWeight: selected ? 700 : 500,
        background: selected ? 'var(--accent)' : 'var(--card)',
        color: selected ? '#fff' : 'var(--ink)',
        border: '2px solid var(--ink)',
        borderRadius: 5,
        padding: selected ? '3px 11px 3px 8px' : '3px 11px',
        cursor: 'pointer',
      }}
    >
      {selected && <CheckIcon size={12} />}
      {label}
    </button>
  );
}

function ChipGroup<T extends string>({
  title,
  hint,
  options,
  labels,
  values,
  onChange,
  small,
}: {
  title: string;
  hint?: string;
  options: readonly T[];
  labels: (v: T) => string;
  values: T[];
  onChange: (next: T[]) => void;
  small?: boolean;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.05em', marginBottom: 9 }}>
        {title.toUpperCase()}
        {hint && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · {hint}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map((opt) => (
          <ChipToggle
            key={opt}
            label={labels(opt)}
            selected={values.includes(opt)}
            small={small}
            onClick={() => onChange(toggle(values, opt))}
          />
        ))}
      </div>
    </div>
  );
}

/** PUBLIC group: "Tous public" clears the whole array; the other options toggle independently
 * (multi-select, round 2b) — not a generic ChipGroup because of that leading clear-all chip. */
function PublicChipGroup<T extends string>({
  options,
  labels,
  values,
  onChange,
}: {
  options: readonly T[];
  labels: (v: T) => string;
  values: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.05em', marginBottom: 9 }}>
        PUBLIC
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        <ChipToggle label={PUBLIC_ALL_LABEL} selected={values.length === 0} onClick={() => onChange([])} />
        {options.map((opt) => (
          <ChipToggle key={opt} label={labels(opt)} selected={values.includes(opt)} onClick={() => onChange(toggle(values, opt))} />
        ))}
      </div>
    </div>
  );
}

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly T[];
  labels: (v: T) => string;
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.05em', marginBottom: 9 }}>
        {legend.toUpperCase()}
      </div>
      <div role="radiogroup" aria-label={legend} style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, fontWeight: 500 }}>
        {options.map((opt) => {
          const checked = value === opt;
          return (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input
                type="radio"
                name={name}
                value={opt}
                checked={checked}
                onChange={() => onChange(opt)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              />
              {checked ? <CircleDotIcon size={16} style={{ color: 'var(--accent)' }} /> : <CircleIcon size={16} style={{ color: 'var(--ink2)' }} />}
              <span style={{ color: checked ? 'var(--accent)' : 'var(--ink2)', fontWeight: checked ? 700 : 500 }}>{labels(opt)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterSidebar({
  filters,
  onChange,
  onReset,
}: {
  filters: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
  onReset: () => void;
}) {
  const [searchText, setSearchText] = useState(filters.q ?? '');
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Resync local search text when filters.q changes externally (back/forward nav, Réinitialiser).
  useEffect(() => {
    setSearchText(filters.q ?? '');
  }, [filters.q]);

  // Debounced auto-apply: no submit button, fires ~350ms after the last keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = searchText.trim() || undefined;
      if (q !== filtersRef.current.q) onChange({ ...filtersRef.current, q, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  function apply(next: Partial<CatalogQuery>) {
    onChange({ ...filters, ...next, page: 1 });
  }

  function addGenre(fr: string) {
    const id = resolveGenreId(fr);
    if (!id || filters.genre.includes(id)) return;
    apply({ genre: [...filters.genre, id] });
  }

  function removeGenre(id: string) {
    apply({ genre: filters.genre.filter((g) => g !== id) });
  }

  return (
    <aside
      className="ep-catalog-sidebar"
      style={{
        width: 212,
        flex: 'none',
        position: 'sticky',
        top: 88,
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 10,
        boxShadow: '5px 5px 0 var(--shadow)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase' }}>Filtrer</div>
        <button
          type="button"
          onClick={onReset}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Réinitialiser
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="catalog-tri" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.05em', display: 'block', marginBottom: 9 }}>
          Trier
        </label>
        <OnBrandSelect
          id="catalog-tri"
          aria-label="Trier"
          value={filters.tri}
          onChange={(e) => apply({ tri: e.target.value as CatalogQuery['tri'] })}
        >
          {CATALOG_TRIS.map((tri) => (
            <option key={tri} value={tri}>
              {TRI_LABELS[tri]}
            </option>
          ))}
        </OnBrandSelect>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 13,
          color: 'var(--ink2)',
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          borderRadius: 6,
          padding: '7px 11px',
          marginBottom: 16,
          fontWeight: 500,
        }}
      >
        <SearchIcon size={14} />
        <input
          aria-label="Titre, auteur…"
          placeholder="Titre, auteur…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: 13, color: 'inherit', font: 'inherit' }}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', letterSpacing: '.05em', marginBottom: 9 }}>
          GENRE <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· plusieurs</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {filters.genre.map((id) => (
            <GenreChip key={id} label={catalogGenreLabel(id)} onRemove={() => removeGenre(id)} />
          ))}
          <GenreSuggestInput ariaLabel="Ajouter un genre" placeholder="Genre…" onCancel={() => {}} onAdd={addGenre} />
        </div>
      </div>

      <RadioGroup
        legend="Statut"
        name="statut"
        options={CATALOG_STATUTS}
        labels={(v) => STATUT_LABELS[v]}
        value={filters.statut}
        onChange={(statut) => apply({ statut })}
      />

      <ChipGroup
        title="Format"
        hint="plusieurs"
        options={CATALOG_FORMATS}
        labels={(v) => v}
        values={filters.format}
        onChange={(format) => apply({ format })}
      />

      <PublicChipGroup
        options={CATALOG_PUBLICS}
        labels={(v) => PUBLIC_LABELS[v]}
        values={filters.public}
        onChange={(pub) => apply({ public: pub })}
      />

      <RadioGroup
        legend="Longueur"
        name="longueur"
        options={CATALOG_LONGUEURS}
        labels={(v) => LONGUEUR_LABELS[v]}
        value={filters.longueur}
        onChange={(longueur) => apply({ longueur })}
      />

      <ChipGroup
        title="Langue"
        hint="plusieurs"
        options={CATALOG_LANGUAGES}
        labels={(v) => v}
        values={filters.langue}
        onChange={(langue) => apply({ langue })}
      />
    </aside>
  );
}
