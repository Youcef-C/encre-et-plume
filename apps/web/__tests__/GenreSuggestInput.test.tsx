import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenreSuggestInput from '../components/GenreSuggestInput';

describe('GenreSuggestInput', () => {
  it('exposes the accessible name from ariaLabel', () => {
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Nouveau genre' })).toBeInTheDocument();
  });

  it('renders the placeholder when provided', () => {
    render(
      <GenreSuggestInput
        ariaLabel="Nouveau genre"
        placeholder="Genre…"
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText('Genre…')).toBeInTheDocument();
  });

  it('does not show a suggestion dropdown when empty', () => {
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('typing shows a custom dropdown (role=listbox/option), not a native datalist', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <GenreSuggestInput ariaLabel="Nouveau genre" onAdd={vi.fn()} onCancel={vi.fn()} />
    );
    await user.type(screen.getByRole('combobox'), 'sein');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Seinen' })).toBeInTheDocument();
    expect(container.querySelector('datalist')).not.toBeInTheDocument();
  });

  it('Enter with an exact vocabulary match calls onAdd with the canonical fr label and clears the input', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    await user.type(input, 'Seinen');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Seinen');
    expect(input).toHaveValue('');
  });

  it('Enter is case- and diacritics-insensitive (shonen -> Shōnen)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'shonen');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Shōnen');
  });

  it('Enter with a multi-word genre resolves correctly', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'Dark Fantasy');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Dark Fantasy');
  });

  it('Enter with a non-matching value does not call onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByRole('combobox');
    await user.type(input, 'pas un genre');
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('Escape clears the input and calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={vi.fn()} onCancel={onCancel} />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    await user.type(input, 'Seinen');
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  describe('blur commits (round 1b)', () => {
    it('blurring with a resolvable value adds the tag (same path as Enter)', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      render(
        <div>
          <GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />
          <button type="button">Elsewhere</button>
        </div>
      );
      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.type(input, 'Seinen');
      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      expect(onAdd).toHaveBeenCalledWith('Seinen');
      expect(input).toHaveValue('');
    });

    it('blurring with a non-matching value clears the input and does not call onAdd', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      render(
        <div>
          <GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />
          <button type="button">Elsewhere</button>
        </div>
      );
      const input = screen.getByRole('combobox') as HTMLInputElement;
      await user.type(input, 'pas un genre');
      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      expect(onAdd).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });
  });

  describe('dropdown keyboard navigation (round 1b)', () => {
    it('ArrowDown moves the highlighted option and Enter selects it', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
      const input = screen.getByRole('combobox');
      // "fantasy" matches several genres (Fantasy, Dark Fantasy, ...) — vocabulary order.
      await user.type(input, 'fantasy');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');
      expect(onAdd).toHaveBeenCalledWith('Dark Fantasy');
    });

    it('clicking an option selects it without the blur handler rejecting it', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn();
      render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={onAdd} onCancel={vi.fn()} />);
      const input = screen.getByRole('combobox');
      await user.type(input, 'sein');
      await user.click(screen.getByRole('option', { name: 'Seinen' }));
      expect(onAdd).toHaveBeenCalledWith('Seinen');
      expect(input).toHaveValue('');
    });

    it('Escape closes the dropdown', async () => {
      const user = userEvent.setup();
      render(<GenreSuggestInput ariaLabel="Nouveau genre" onAdd={vi.fn()} onCancel={vi.fn()} />);
      const input = screen.getByRole('combobox');
      await user.type(input, 'sein');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
