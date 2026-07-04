// DR-5 FE-7 — sort control. Replica of prototype GALERIE line 607 "Trié par : Tendance ▾".
// On-brand form control rule: OnBrandSelect, never a bare native <select>; auto-apply on change,
// no "Appliquer" button.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GalleryQuery } from '@encre-et-plume/shared';
import SortSelect from '../components/galerie/SortSelect';
import { EMPTY_GALLERY_FILTERS } from '../lib/gallery';

describe('SortSelect (DR-5 FE-7)', () => {
  it('renders the "Trié par :" label', () => {
    render(<SortSelect filters={EMPTY_GALLERY_FILTERS} onChange={() => {}} />);
    expect(screen.getByText('Trié par :')).toBeInTheDocument();
  });

  it('lists the three sort options', () => {
    render(<SortSelect filters={EMPTY_GALLERY_FILTERS} onChange={() => {}} />);
    const select = screen.getByLabelText('Trié par :');
    expect(select).toHaveValue('tendance');
    expect(screen.getByRole('option', { name: 'Tendance' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nouveautés' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Populaires' })).toBeInTheDocument();
  });

  it('changing the select auto-applies (navigates) and resets page to 1', () => {
    const onChange = vi.fn();
    render(<SortSelect filters={{ ...EMPTY_GALLERY_FILTERS, page: 2 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Trié par :'), { target: { value: 'populaires' } });
    const next: GalleryQuery = onChange.mock.calls[0]![0];
    expect(next.tri).toBe('populaires');
    expect(next.page).toBe(1);
  });

  it('never renders an "Appliquer" button', () => {
    render(<SortSelect filters={EMPTY_GALLERY_FILTERS} onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /appliquer/i })).not.toBeInTheDocument();
  });
});
