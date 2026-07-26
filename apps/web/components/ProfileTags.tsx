'use client';

import { useState } from 'react';
import { updateMyProfile } from '../lib/api';
import GenreSuggestInput from './GenreSuggestInput';
import GenreChip from './GenreChip';
import { CheckIcon } from './icons';

// F-3 — Selectable tag cloud (Genres & affinités).
// Visitor: read-only filled chips. Owner: add via vocabulary picker, remove via ✕.
// F-20 — ＋ Ajouter is vocabulary-restricted (GenreSuggestInput), no free text.
// F-20 round 1b — dropped toggle/deselect semantics per user UX refinement:
// every chip is always filled accent red; removed via a small ✕ (GenreChip),
// identical to the "Recherche active" seeking picker (ProfilePageClient).
type Props = { tags: string[]; isOwner: boolean };

export default function ProfileTags({ tags: initialTags, isOwner }: Props) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [addingTag, setAddingTag] = useState(false);

  // Visitor: static filled chips
  if (!isOwner) {
    if (tags.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'var(--accent)',
              color: '#fff',
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {tag}
            <CheckIcon size={13} />
          </span>
        ))}
      </div>
    );
  }

  async function persist(next: string[]) {
    setTags(next);
    await updateMyProfile({ tags: next }).catch(() => {});
  }

  async function handleAddTag(fr: string) {
    setAddingTag(false);
    // Case-insensitive dedup
    const already = tags.some((t) => t.toLowerCase() === fr.toLowerCase());
    if (already) return;
    await persist([...tags, fr]);
  }

  async function handleRemoveTag(tag: string) {
    await persist(tags.filter((t) => t !== tag));
  }

  // Owner: removable chips + add control
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {tags.map((tag) => (
        <GenreChip key={tag} label={tag} onRemove={() => void handleRemoveTag(tag)} />
      ))}

      {addingTag ? (
        <GenreSuggestInput
          ariaLabel="Nouveau genre"
          placeholder="Genre…"
          onCancel={() => setAddingTag(false)}
          onAdd={(fr) => void handleAddTag(fr)}
          onRemoveLast={() => tags.length > 0 && void handleRemoveTag(tags[tags.length - 1])}
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
