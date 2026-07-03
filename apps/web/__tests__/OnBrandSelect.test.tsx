import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnBrandSelect from '../components/form/OnBrandSelect';

describe('OnBrandSelect', () => {
  it('renders a real <select> with the on-brand ink-border styling', () => {
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>
    );
    const select = screen.getByRole('combobox', { name: 'Trier' }) as HTMLSelectElement;
    expect(select.style.fontWeight).toBe('700');
    expect(select.style.border).toBe('2px solid var(--ink)');
  });

  it('forwards onChange and value selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Trier' }), 'b');
    expect(onChange).toHaveBeenCalled();
  });
});
