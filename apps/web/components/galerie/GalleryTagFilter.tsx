'use client';

// F-22 — debounced, auto-applied freetext hashtag filter for Galerie. Mirrors GallerySearchInput
// (no submit button, ~350ms debounce, resyncs on external value change) but commits the normalized
// hashtag via the shared normalizeHashtag, and shows the active tag as a removable GenreChip.
import { useEffect, useRef, useState } from 'react';
import { normalizeHashtag } from '@encre-et-plume/shared';
import { TagIcon } from '../icons';
import GenreChip from '../GenreChip';

const TAG_DEBOUNCE_MS = 350;

export default function GalleryTagFilter({
  tag,
  onChange,
}: {
  tag: string | undefined;
  onChange: (tag: string | undefined) => void;
}) {
  const [text, setText] = useState(tag ?? '');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setText(tag ?? '');
  }, [tag]);

  useEffect(() => {
    const id = setTimeout(() => {
      const next = normalizeHashtag(text) || undefined;
      if (next !== (tag || undefined)) onChangeRef.current(next);
    }, TAG_DEBOUNCE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
          minWidth: 160,
        }}
      >
        <TagIcon size={14} />
        <input
          aria-label="#hashtag…"
          placeholder="#hashtag…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ border: 'none', background: 'none', outline: 'none', width: '100%', fontSize: 13, color: 'inherit', font: 'inherit' }}
        />
      </div>
      {tag && <GenreChip label={`#${tag}`} onRemove={() => onChangeRef.current(undefined)} />}
    </div>
  );
}
