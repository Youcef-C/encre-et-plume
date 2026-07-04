'use client';

// DR-5 Round 2 — debounced search bar over illustration title/artist. Mirrors FilterSidebar's
// inline debounced search (DR-2 lines 182-199): no submit button, auto-applies ~350ms after the
// last keystroke, resyncs when the value changes externally (back/forward nav, reset).
import { useEffect, useRef, useState } from 'react';
import { SearchIcon } from '../icons';

const SEARCH_DEBOUNCE_MS = 350;

export default function GallerySearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string | undefined) => void;
}) {
  const [text, setText] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      const q = text.trim() || undefined;
      if (q !== (value || undefined)) onChangeRef.current(q);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
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
      }}
    >
      <SearchIcon size={14} />
      <input
        aria-label="Titre, artiste…"
        placeholder="Titre, artiste…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: 13, color: 'inherit', font: 'inherit' }}
      />
    </div>
  );
}
