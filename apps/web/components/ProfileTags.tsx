'use client';

import { useState } from 'react';
import { updateMyProfile } from '../lib/api';

// F-3 — Selectable tag cloud (Genres & affinités).
// Visitor: read-only filled chips. Owner: keyboard-operable toggles + ＋ Ajouter.
type Props = { tags: string[]; isOwner: boolean };

export default function ProfileTags({ tags: initialTags, isOwner }: Props) {
  // Full tag list (union of initially selected + any user-added)
  const [tags, setTags] = useState<string[]>(initialTags);
  // Initially all tags are selected; owner can toggle them off
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags));
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');

  // Visitor: static filled chips
  if (!isOwner) {
    if (tags.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {tag} &#10003;
          </span>
        ))}
      </div>
    );
  }

  async function handleToggle(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
    await updateMyProfile({ tags: [...next] }).catch(() => {});
  }

  async function handleAddTag() {
    const trimmed = newTag.trim();
    setNewTag('');
    setAddingTag(false);
    if (!trimmed) return;
    // Case-insensitive dedup
    const already = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (already) return;
    const nextTags = [...tags, trimmed];
    const nextSelected = new Set(selected);
    nextSelected.add(trimmed);
    setTags(nextTags);
    setSelected(nextSelected);
    await updateMyProfile({ tags: [...nextSelected] }).catch(() => {});
  }

  // Owner: toggleable chips + add control
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {tags.map((tag) => {
        const isSelected = selected.has(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={isSelected}
            onClick={() => void handleToggle(tag)}
            style={{
              background: isSelected ? 'var(--accent)' : 'var(--card)',
              color: isSelected ? '#fff' : 'var(--ink)',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.08s, color 0.08s',
            }}
          >
            {tag}
            {isSelected ? ' ✓' : ''}
          </button>
        );
      })}

      {addingTag ? (
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { void handleAddTag(); }
            if (e.key === 'Escape') { setNewTag(''); setAddingTag(false); }
          }}
          placeholder="Nouveau tag…"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          aria-label="Nouveau tag"
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
      ) : (
        <button
          type="button"
          onClick={() => setAddingTag(true)}
          style={{
            background: 'var(--card)',
            color: 'var(--ink)',
            border: '2px dashed var(--border)',
            borderRadius: 5,
            padding: '4px 12px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          &#xFF0B; Ajouter
        </button>
      )}
    </div>
  );
}
