// F-22 — debounced, auto-applied freetext hashtag filter for Galerie (no submit button, F-20 rule).
// Mirrors GallerySearchInput; the active tag shows as a removable GenreChip.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GalleryTagFilter from '../components/galerie/GalleryTagFilter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GalleryTagFilter (F-22)', () => {
  it('renders with the current tag prefilled', () => {
    render(<GalleryTagFilter tag="yokai" onChange={() => {}} />);
    expect(screen.getByLabelText('#hashtag…')).toHaveValue('yokai');
  });

  it('does not call onChange immediately while typing (no submit button)', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tag={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('#hashtag…'), { target: { value: 'yokai' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Appliquer/ })).not.toBeInTheDocument();
  });

  it('auto-applies the normalized tag ~350ms after the last keystroke', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tag={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('#hashtag…'), { target: { value: '#Yokai ' } });
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledWith('yokai');
  });

  it('clears cleanly — empty text auto-applies as undefined', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tag="yokai" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('#hashtag…'), { target: { value: '' } });
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows the active tag as a removable #chip and removing it clears the filter', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tag="yokai" onChange={onChange} />);
    expect(screen.getByText('#yokai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer #yokai' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows no active chip when there is no tag', () => {
    render(<GalleryTagFilter tag={undefined} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });
});
