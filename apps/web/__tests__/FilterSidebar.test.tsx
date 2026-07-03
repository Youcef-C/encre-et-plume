import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EMPTY_FILTERS } from '../lib/catalog';
import FilterSidebar from '../components/catalog/FilterSidebar';

describe('FilterSidebar (DR-2 FE-4, round 2 — auto-apply, no "Appliquer")', () => {
  it('renders the "Filtrer" title and "Réinitialiser" affordance calling onReset (F1)', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={onReset} />);
    expect(screen.getByText('Filtrer')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('never renders an "Appliquer les filtres" button', () => {
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /appliquer/i })).not.toBeInTheDocument();
  });

  it('never renders a THÈMES section', () => {
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByText(/th[eè]mes/i)).not.toBeInTheDocument();
  });

  it('renders a TRIER dropdown as the very first filter control, immediate on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Trier' });
    expect(select).toBeInTheDocument();
    await user.selectOptions(select, 'nouveautes');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tri: 'nouveautes' }));
  });

  it('TRIER options are Populaires / Nouveautés / Mieux notées', () => {
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Trier' }) as HTMLSelectElement;
    const optionLabels = [...select.options].map((o) => o.textContent);
    expect(optionLabels).toEqual(['Populaires', 'Nouveautés', 'Mieux notées']);
  });

  describe('debounced search', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('auto-applies the search text after a debounce, no submit button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
      const input = screen.getByLabelText('Titre, auteur…');
      await user.type(input, 'Ronin');
      expect(onChange).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'Ronin' }));
    });

    it('resyncs the local search text when filters.q changes externally', () => {
      const { rerender } = render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
      rerender(<FilterSidebar filters={{ ...EMPTY_FILTERS, q: 'Ronin' }} onChange={vi.fn()} onReset={vi.fn()} />);
      expect(screen.getByLabelText('Titre, auteur…')).toHaveValue('Ronin');
    });
  });

  describe('GENRE picker (full F-20 vocabulary, GenreSuggestInput + GenreChip)', () => {
    it('renders a GenreChip per selected genre id with the fr label', () => {
      render(<FilterSidebar filters={{ ...EMPTY_FILTERS, genre: ['shonen'] }} onChange={vi.fn()} onReset={vi.fn()} />);
      expect(screen.getByText('Shōnen')).toBeInTheDocument();
    });

    it('adding a genre via the picker resolves the fr label to an id and calls onChange', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
      const input = screen.getByRole('combobox', { name: /genre/i });
      await user.type(input, 'Action');
      await user.keyboard('{Enter}');
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ genre: ['action'] }));
    });

    it('removing a genre chip calls onChange without that id', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <FilterSidebar filters={{ ...EMPTY_FILTERS, genre: ['seinen', 'shonen'] }} onChange={onChange} onReset={vi.fn()} />,
      );
      await user.click(screen.getByRole('button', { name: /retirer sh[oō]nen/i }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ genre: ['seinen'] }));
    });
  });

  it('renders STATUT radios, immediate on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: 'Œuvres complètes' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ statut: 'complete' }));
  });

  it('renders FORMAT chips, immediate multi-select on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Manga' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: ['Manga'] }));
  });

  describe('PUBLIC multi-select chips (round 2b)', () => {
    it('renders "Tous public" / "Mature" / "+18"', () => {
      render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Tous public' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mature' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+18' })).toBeInTheDocument();
    });

    it('"Tous public" is selected (aria-pressed) when public is empty', () => {
      render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Tous public' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Mature' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: '+18' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicking "Mature" selects it (Tous public no longer pressed) and calls onChange', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Mature' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ public: ['mature'] }));
    });

    it('"Mature" and "+18" toggle independently — both can be selected at once', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FilterSidebar filters={{ ...EMPTY_FILTERS, public: ['mature'] }} onChange={onChange} onReset={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Mature' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: '+18' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ public: ['mature', '18plus'] }));
    });

    it('clicking "Tous public" clears both Mature and +18', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<FilterSidebar filters={{ ...EMPTY_FILTERS, public: ['mature', '18plus'] }} onChange={onChange} onReset={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Tous public' }));
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ public: [] }));
    });
  });

  it('renders LONGUEUR radios, immediate on change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={onChange} onReset={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /court/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ longueur: 'court' }));
  });

  it('renders exactly 3 LANGUE chips, no "Traduit"', () => {
    render(<FilterSidebar filters={EMPTY_FILTERS} onChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Français' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '日本語' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traduit' })).not.toBeInTheDocument();
  });
});
