'use client';

// DR-5 Round 2 — genre filter. Same searchbar-to-add-tags picker as DR-2's FilterSidebar GENRE
// facet (GenreSuggestInput + red GenreChip, full F-20 vocabulary, multi-select OR-within) —
// reuses catalogGenreLabel/resolveGenreId from @encre-et-plume/shared, no duplicate id<->label map.
import { catalogGenreLabel, resolveGenreId } from '@encre-et-plume/shared';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';

export default function GalleryGenreFilter({
  genre,
  onChange,
}: {
  genre: string[];
  onChange: (next: string[]) => void;
}) {
  function addGenre(fr: string) {
    const id = resolveGenreId(fr);
    if (!id || genre.includes(id)) return;
    onChange([...genre, id]);
  }

  function removeGenre(id: string) {
    onChange(genre.filter((g) => g !== id));
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {genre.map((id) => (
        <GenreChip key={id} label={catalogGenreLabel(id)} onRemove={() => removeGenre(id)} />
      ))}
      <GenreSuggestInput ariaLabel="Ajouter un genre" placeholder="Genre…" onCancel={() => {}} onAdd={addGenre} />
    </div>
  );
}
