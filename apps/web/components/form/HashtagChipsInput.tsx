'use client';

// DR-12 iter2 (FE-9) — freetext hashtag chips input (F-22 grammar, shared with the Galerie tag
// filter but this one is a controlled *form field*, not a URL facet). Space / Enter commit the
// current token through normalizeHashtag; committed tags render as removable "#tag" chips BEFORE
// the input; Backspace on an empty input removes the last chip; paste splits on whitespace. Chips
// are ink-bordered (hashtags are NOT the red F-20 GenreChip vocabulary). Capped at HASHTAGS_MAX_COUNT.
import { useState } from 'react';
import { normalizeHashtag, HASHTAGS_MAX_COUNT } from '@encre-et-plume/shared';
import { XIcon } from '../icons';

export default function HashtagChipsInput({
  value,
  onChange,
  ariaLabel,
  placeholder = '#encre #noir…',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [text, setText] = useState('');

  function commit() {
    const tag = normalizeHashtag(text);
    setText('');
    if (!tag || value.includes(tag) || value.length >= HASHTAGS_MAX_COUNT) return;
    onChange([...value, tag]);
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      e.preventDefault();
      remove(value[value.length - 1]);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const raw = e.clipboardData.getData('text');
    if (!/\s/.test(raw)) return; // single token — let it type, space/Enter commits
    e.preventDefault();
    const merged = [...value];
    for (const part of raw.split(/\s+/)) {
      const tag = normalizeHashtag(part);
      if (tag && !merged.includes(tag) && merged.length < HASHTAGS_MAX_COUNT) merged.push(tag);
    }
    setText('');
    onChange(merged);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        border: '2px solid var(--ink)',
        borderRadius: 8,
        padding: '7px 9px',
        background: 'var(--card)',
      }}
    >
      {value.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: 'var(--paper)',
            border: '2px solid var(--ink)',
            borderRadius: 5,
            padding: '3px 6px 3px 10px',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink)',
          }}
        >
          #{tag}
          <button
            type="button"
            aria-label={`Retirer #${tag}`}
            onClick={() => remove(tag)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 2 }}
          >
            <XIcon size={13} />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        placeholder={value.length === 0 ? placeholder : ''}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        style={{
          flex: 1,
          minWidth: 90,
          border: 'none',
          background: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--ink)',
          font: 'inherit',
        }}
      />
    </div>
  );
}
