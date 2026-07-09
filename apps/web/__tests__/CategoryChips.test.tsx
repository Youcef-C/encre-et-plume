// DR-5 FE-6 — category chip row. Replica of prototype GALERIE lines 599-605 (single active).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GalleryQuery } from '@encre-et-plume/shared';
import CategoryChips from '../components/galerie/CategoryChips';
import { EMPTY_GALLERY_FILTERS } from '../lib/gallery';

describe('CategoryChips (DR-5 FE-6)', () => {
  it('renders the 6 verbatim chip labels', () => {
    render(<CategoryChips filters={EMPTY_GALLERY_FILTERS} onChange={() => {}} />);
    for (const label of ['Tout', 'Personnages', 'Couvertures', 'Décors', 'Fan-art', 'Process']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks exactly one chip aria-pressed=true — "Tout" when no category is active', () => {
    render(<CategoryChips filters={EMPTY_GALLERY_FILTERS} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Personnages' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the active category chip pressed', () => {
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, category: 'fanart' }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fan-art' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a category chip sets the category and resets page to 1', () => {
    const onChange = vi.fn();
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, page: 3 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Décors' }));
    const next: GalleryQuery = onChange.mock.calls[0]![0];
    expect(next.category).toBe('decors');
    expect(next.page).toBe(1);
  });

  it('clicking "Tout" clears the category', () => {
    const onChange = vi.fn();
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, category: 'process' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    expect(onChange.mock.calls[0]![0].category).toBeUndefined();
  });
});

// DR-12 iter2 (FE-8 · V7) — "Collections" chip toggles the FE view mode (collectionsMode), stays in
// the single-active row, and any illustration category (or "Tout") clears it.
describe('CategoryChips — Collections chip (DR-12 iter2 FE-8)', () => {
  it('renders a "Collections" chip pressed when collectionsMode is on', () => {
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, collectionsMode: true }} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Collections' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Personnages' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('activates collections mode and clears any category', () => {
    const onChange = vi.fn();
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, category: 'fanart', page: 4 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ collectionsMode: true, category: undefined, page: 1 }),
    );
  });

  it('selecting an illustration category clears collections mode', () => {
    const onChange = vi.fn();
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, collectionsMode: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Décors' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'decors', collectionsMode: false, page: 1 }),
    );
  });

  it('"Tout" clears both category and collections mode', () => {
    const onChange = vi.fn();
    render(<CategoryChips filters={{ ...EMPTY_GALLERY_FILTERS, collectionsMode: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined, collectionsMode: false, page: 1 }),
    );
  });
});
