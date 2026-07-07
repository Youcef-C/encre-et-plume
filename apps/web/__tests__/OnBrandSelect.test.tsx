import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnBrandSelect from '../components/form/OnBrandSelect';

describe('OnBrandSelect', () => {
  it('renders a combobox trigger with the on-brand ink-border styling', () => {
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trier' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger.style.fontWeight).toBe('700');
    expect(trigger.style.border).toBe('2px solid var(--ink)');
    expect(trigger).toHaveTextContent('A'); // shows the current value's label
  });

  it('opens the listbox and forwards the chosen value through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Trier' }));
    await user.click(screen.getByRole('option', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'b' } });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trier' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});
