import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogQuery } from '@encre-et-plume/shared';
import { EMPTY_FILTERS } from '../lib/catalog';
import ActiveFilters from '../components/catalog/ActiveFilters';

describe('ActiveFilters (DR-2 FE-5)', () => {
  it('renders nothing when no filters are active', () => {
    const { container } = render(<ActiveFilters filters={EMPTY_FILTERS} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the "FILTRES ACTIFS" label and one chip per active facet value (F13)', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['shonen'], format: ['Manga'] };
    render(<ActiveFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('FILTRES ACTIFS :')).toBeInTheDocument();
    expect(screen.getByText('Shōnen')).toBeInTheDocument();
    expect(screen.getByText('Manga')).toBeInTheDocument();
  });

  it('each chip has a descriptive remove button (F18)', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['shonen'] };
    render(<ActiveFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retirer le filtre Shōnen' })).toBeInTheDocument();
  });

  it('removing a chip calls onChange with that facet value cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['seinen', 'shonen'] };
    render(<ActiveFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Retirer le filtre Shōnen' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ genre: ['seinen'] }));
  });

  it('"Tout effacer" clears every active filter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: CatalogQuery = { ...EMPTY_FILTERS, genre: ['seinen'], format: ['Manga'], statut: 'complete' };
    render(<ActiveFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Tout effacer' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('renders one PUBLIC chip per selected value, none when empty (round 2b)', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, public: ['mature'] };
    render(<ActiveFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Mature')).toBeInTheDocument();
    expect(screen.queryByText('Tous public')).not.toBeInTheDocument();
  });

  it('renders both PUBLIC chips when both are selected (round 2b)', () => {
    const filters: CatalogQuery = { ...EMPTY_FILTERS, public: ['mature', '18plus'] };
    render(<ActiveFilters filters={filters} onChange={vi.fn()} />);
    expect(screen.getByText('Mature')).toBeInTheDocument();
    expect(screen.getByText('+18')).toBeInTheDocument();
  });

  it('removing a PUBLIC chip clears just that value (round 2b)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: CatalogQuery = { ...EMPTY_FILTERS, public: ['mature', '18plus'] };
    render(<ActiveFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Retirer le filtre +18' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ public: ['mature'] }));
  });
});
