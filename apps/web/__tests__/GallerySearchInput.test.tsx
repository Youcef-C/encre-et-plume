// DR-5 Round 2 — debounced search bar over illustration title/artist. Mirrors FilterSidebar's
// inline debounced search (DR-2), auto-applies while typing, no submit button.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GallerySearchInput from '../components/galerie/GallerySearchInput';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GallerySearchInput (DR-5 Round 2)', () => {
  it('renders with the current value', () => {
    render(<GallerySearchInput value="onibi" onChange={() => {}} />);
    expect(screen.getByLabelText('Titre, artiste…')).toHaveValue('onibi');
  });

  it('does not call onChange immediately while typing (no submit button, auto-applies later)', () => {
    const onChange = vi.fn();
    render(<GallerySearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Titre, artiste…'), { target: { value: 'onibi' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('auto-applies (calls onChange) ~350ms after the last keystroke', () => {
    const onChange = vi.fn();
    render(<GallerySearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Titre, artiste…'), { target: { value: 'onibi' } });
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledWith('onibi');
  });

  it('clears cleanly — empty text auto-applies as undefined', () => {
    const onChange = vi.fn();
    render(<GallerySearchInput value="onibi" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Titre, artiste…'), { target: { value: '' } });
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('never renders an "Appliquer" submit button', () => {
    render(<GallerySearchInput value="" onChange={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('resyncs local text when the value prop changes externally (e.g. back/forward nav)', () => {
    const { rerender } = render(<GallerySearchInput value="" onChange={() => {}} />);
    rerender(<GallerySearchInput value="néon" onChange={() => {}} />);
    expect(screen.getByLabelText('Titre, artiste…')).toHaveValue('néon');
  });
});
