// F-22 — multi-tag freetext hashtag filter for Galerie (token field). Enter / comma / space commit
// the current text as a normalized #tag; Backspace on an empty input removes the last chip; each
// chip is individually removable. Commit/remove applies immediately (no debounce, no submit button).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GalleryTagFilter from '../components/galerie/GalleryTagFilter';

const input = () => screen.getByLabelText('#hashtag…');
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('GalleryTagFilter (F-22 multi-tag)', () => {
  it('renders existing tags as removable #chips', () => {
    render(<GalleryTagFilter tags={['yokai', 'encre']} onChange={() => {}} />);
    expect(screen.getByText('#yokai')).toBeInTheDocument();
    expect(screen.getByText('#encre')).toBeInTheDocument();
  });

  it('Enter commits the current text as a normalized tag', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={[]} onChange={onChange} />);
    type('#Yokai ');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['yokai']);
  });

  it('a comma commits the current tag (appending, not replacing)', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={['yokai']} onChange={onChange} />);
    type('encre');
    fireEvent.keyDown(input(), { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['yokai', 'encre']);
  });

  it('a space commits the current tag', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={[]} onChange={onChange} />);
    type('naruto');
    fireEvent.keyDown(input(), { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(['naruto']);
  });

  it('does not add a duplicate tag', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={['yokai']} onChange={onChange} />);
    type('yokai');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Backspace on an empty input removes the last chip', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={['yokai', 'encre']} onChange={onChange} />);
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['yokai']);
  });

  it('Backspace does NOT remove a chip while there is text', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={['yokai']} onChange={onChange} />);
    type('en');
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removing a chip via its ✕ drops that tag', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={['yokai', 'encre']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer #yokai' }));
    expect(onChange).toHaveBeenCalledWith(['encre']);
  });

  it('blur commits pending text', () => {
    const onChange = vi.fn();
    render(<GalleryTagFilter tags={[]} onChange={onChange} />);
    type('yokai');
    fireEvent.blur(input());
    expect(onChange).toHaveBeenCalledWith(['yokai']);
  });

  it('shows no chip when there are no tags', () => {
    render(<GalleryTagFilter tags={[]} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });
});
