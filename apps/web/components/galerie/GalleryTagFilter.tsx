'use client';

// F-22 — multi-tag freetext hashtag filter for Galerie. Enter / comma / space commit the current
// text as a normalized #tag; Backspace on an empty input removes the last chip. Validated hashtags
// render as removable chips OUTSIDE the input. Commit/remove applies the filter immediately (each
// change narrows the gallery — the tags AND-match, hasEvery, server-side). No vocabulary: hashtags
// are freetext by design (fan-art of existing licenses, techniques, characters).
import { useState } from 'react';
import { normalizeHashtag } from '@encre-et-plume/shared';
import { TagIcon } from '../icons';
import GenreChip from '../GenreChip';

export default function GalleryTagFilter({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState('');

  function commit() {
    const tag = normalizeHashtag(text);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setText('');
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      // Enter / comma / space all commit the current token (and never get typed into the field).
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
      // Backspace on an empty input deletes the previous chip.
      e.preventDefault();
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
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
          onKeyDown={handleKeyDown}
          onBlur={commit}
          style={{
            border: 'none',
            background: 'none',
            outline: 'none',
            width: '100%',
            minWidth: 90,
            fontSize: 13,
            color: 'inherit',
            font: 'inherit',
          }}
        />
      </div>
      {/* Validated hashtags render outside the input, as removable chips. */}
      {tags.map((t) => (
        <GenreChip key={t} label={`#${t}`} onRemove={() => remove(t)} />
      ))}
    </div>
  );
}
