// DR-5 Round 2 — genre filter. Same searchbar-to-add-tags picker as DR-2's FilterSidebar GENRE
// facet: GenreSuggestInput + red GenreChip with ✕ removal, full F-20 vocabulary, multi-select.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GalleryGenreFilter from '../components/galerie/GalleryGenreFilter';

describe('GalleryGenreFilter (DR-5 Round 2)', () => {
  it('renders one GenreChip per selected genre id, with its French label', () => {
    render(<GalleryGenreFilter genre={['seinen', 'yokai']} onChange={() => {}} />);
    expect(screen.getByText('Seinen')).toBeInTheDocument();
    expect(screen.getByText('Yōkai')).toBeInTheDocument();
  });

  it('renders the add-genre suggest input', () => {
    render(<GalleryGenreFilter genre={[]} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Ajouter un genre' })).toBeInTheDocument();
  });

  it('adding a genre via the suggest input appends its id', () => {
    const onChange = vi.fn();
    render(<GalleryGenreFilter genre={[]} onChange={onChange} />);
    const input = screen.getByRole('combobox', { name: 'Ajouter un genre' });
    fireEvent.change(input, { target: { value: 'Seinen' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['seinen']);
  });

  it('removing a chip removes just that id', () => {
    const onChange = vi.fn();
    render(<GalleryGenreFilter genre={['seinen', 'yokai']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Seinen' }));
    expect(onChange).toHaveBeenCalledWith(['yokai']);
  });
});
