import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OnBrandMultiSelect from '../components/form/OnBrandMultiSelect';

const flat = [
  { value: 'josei', label: 'Josei' },
  { value: 'seinen', label: 'Seinen' },
];

const grouped = [
  { group: 'Continents', options: [{ value: 'Europe', label: 'Europe' }] },
  { group: 'Pays', options: [{ value: 'JP', label: 'Japon' }, { value: 'RE', label: 'La Réunion' }] },
];

describe('OnBrandMultiSelect', () => {
  it('opens the listbox on click and closes on Escape, returning focus to the trigger', async () => {
    render(<OnBrandMultiSelect label="Genres" options={flat} values={[]} onChange={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Genres/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('fires onChange with the toggled array when an option is checked', async () => {
    const onChange = vi.fn();
    render(<OnBrandMultiSelect label="Genres" options={flat} values={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Genres/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seinen' }));
    expect(onChange).toHaveBeenCalledWith(['seinen']);
  });

  it('unchecks a selected option back out of the array', async () => {
    const onChange = vi.fn();
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['seinen']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Genres/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seinen' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows the selected count in the trigger label', () => {
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei', 'seinen']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Genres \(2\)/ })).toBeInTheDocument();
  });

  it('renders group headers for grouped options', async () => {
    render(<OnBrandMultiSelect label="Localisation" options={grouped} values={[]} onChange={() => {}} searchable />);
    await userEvent.click(screen.getByRole('button', { name: /Localisation/ }));
    expect(screen.getByText('Continents')).toBeInTheDocument();
    expect(screen.getByText('Pays')).toBeInTheDocument();
  });

  it('filters options accent-insensitively when searchable', async () => {
    render(<OnBrandMultiSelect label="Localisation" options={grouped} values={[]} onChange={() => {}} searchable />);
    await userEvent.click(screen.getByRole('button', { name: /Localisation/ }));
    await userEvent.type(screen.getByRole('textbox'), 'reunion');
    expect(screen.getByRole('checkbox', { name: 'La Réunion' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Japon' })).not.toBeInTheDocument();
  });

  it('does NOT render selected chips outside the popover (closed) — keeps the filter row aligned', () => {
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei']} onChange={() => {}} />);
    // Collapsed: only the trigger (with its count badge) shows — no in-row chip stack to grow the row.
    expect(screen.getByRole('button', { name: /Genres \(1\)/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Josei')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer Josei' })).not.toBeInTheDocument();
  });

  it('renders selected chips at the TOP of the open listbox, above the options', async () => {
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei']} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Genres/ }));
    const listbox = screen.getByRole('listbox');
    const chip = within(listbox).getByRole('button', { name: 'Retirer Josei' });
    const firstOption = within(listbox).getByRole('checkbox', { name: 'Josei' });
    // chip appears before the option list in DOM order
    expect(chip.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('deselects a value (re-firing onChange) when its chip × is clicked', async () => {
    const onChange = vi.fn();
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei', 'seinen']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Genres/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Josei' }));
    expect(onChange).toHaveBeenCalledWith(['seinen']);
  });

  it('resolves grouped-option labels for chips (ISO code → French name)', async () => {
    render(<OnBrandMultiSelect label="Localisation" options={grouped} values={['JP']} onChange={() => {}} searchable />);
    await userEvent.click(screen.getByRole('button', { name: /Localisation/ }));
    // ISO code JP resolves to the French label on the removable chip.
    expect(screen.getByRole('button', { name: 'Retirer Japon' })).toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    render(
      <div>
        <OnBrandMultiSelect label="Genres" options={flat} values={[]} onChange={() => {}} />
        <button type="button">dehors</button>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: /Genres/ });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'dehors' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
