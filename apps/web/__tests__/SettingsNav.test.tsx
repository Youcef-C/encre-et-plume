import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsNav from '../components/settings/SettingsNav';

describe('SettingsNav', () => {
  it('renders a labelled nav landmark', () => {
    render(<SettingsNav />);
    expect(screen.getByRole('navigation', { name: 'Sections des paramètres' })).toBeInTheDocument();
  });

  it('renders the five section links, in order, with correct anchors', () => {
    render(<SettingsNav />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(5);

    const expected = [
      ['Préférences de notification', '#notifications'],
      ['Cookies', '#cookies'],
      ['Sécurité', '#securite'],
      ['Contenu 18+', '#contenu-adulte'],
      ['Mes données', '#mes-donnees'],
    ];

    expected.forEach(([label, href], i) => {
      expect(links[i]).toHaveTextContent(label);
      expect(links[i]).toHaveAttribute('href', href);
    });
  });

  it('clicking a nav link expands the target section and collapses the others (accordion)', () => {
    const target = document.createElement('details');
    target.id = 'cookies';
    const other = document.createElement('details');
    other.id = 'securite';
    other.open = true;
    document.body.append(target, other);
    try {
      render(<SettingsNav />);
      expect(target.open).toBe(false);
      fireEvent.click(screen.getByRole('link', { name: 'Cookies' }));
      expect(target.open).toBe(true);
      expect(other.open).toBe(false);
    } finally {
      target.remove();
      other.remove();
    }
  });
});
