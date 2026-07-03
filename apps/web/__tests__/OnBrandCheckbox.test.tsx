import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnBrandCheckbox from '../components/form/OnBrandCheckbox';

describe('OnBrandCheckbox', () => {
  it('renders a real checkbox input wrapped in a label (click-to-toggle)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OnBrandCheckbox label="Recherche active" checked={false} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Recherche active' });
    expect(checkbox).not.toBeChecked();
    await user.click(screen.getByText('Recherche active'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows the CheckIcon (an svg) inside the box only when checked', () => {
    const { rerender, container } = render(
      <OnBrandCheckbox label="Actif" checked={false} onChange={() => {}} />
    );
    expect(container.querySelector('.ep-checkbox-box svg')).not.toBeInTheDocument();
    rerender(<OnBrandCheckbox label="Actif" checked onChange={() => {}} />);
    expect(container.querySelector('.ep-checkbox-box svg')).toBeInTheDocument();
  });

  it('is keyboard-toggleable (native checkbox behavior via Space)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OnBrandCheckbox label="Actif" checked={false} onChange={onChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Actif' });
    checkbox.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalled();
  });

  it('supports disabled state', () => {
    render(<OnBrandCheckbox label="Essentiels" checked disabled onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Essentiels' })).toBeDisabled();
  });

  it('without a label prop, renders only the input+box (for external <label htmlFor>)', () => {
    render(
      <div>
        <OnBrandCheckbox id="rememberMe" checked={false} onChange={() => {}} />
        <label htmlFor="rememberMe">Se souvenir de moi</label>
      </div>
    );
    expect(screen.getByRole('checkbox', { name: 'Se souvenir de moi' })).toBeInTheDocument();
  });

  it('accepts rich (JSX) label content and folds it into the accessible name', () => {
    render(
      <OnBrandCheckbox
        checked={false}
        onChange={() => {}}
        label={
          <span>
            J&apos;accepte les <a href="/cgu">Conditions générales</a>
          </span>
        }
      />
    );
    expect(screen.getByRole('checkbox', { name: /j'accepte les conditions générales/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conditions générales/i })).toBeInTheDocument();
  });
});
