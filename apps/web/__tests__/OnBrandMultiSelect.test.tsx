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

  it('renders the selected values as removable chips outside the popover (closed)', () => {
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei']} onChange={() => {}} />);
    // trigger is collapsed, yet the chosen chip shows at a glance
    expect(screen.getByRole('button', { name: /Genres/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Josei')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer Josei' })).toBeInTheDocument();
  });

  it('deselects a value (re-firing onChange) when its chip × is clicked', async () => {
    const onChange = vi.fn();
    render(<OnBrandMultiSelect label="Genres" options={flat} values={['josei', 'seinen']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer Josei' }));
    expect(onChange).toHaveBeenCalledWith(['seinen']);
  });

  it('resolves grouped-option labels for chips (ISO code → French name)', () => {
    render(<OnBrandMultiSelect label="Localisation" options={grouped} values={['JP']} onChange={() => {}} searchable />);
    expect(screen.getByText('Japon')).toBeInTheDocument();
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
