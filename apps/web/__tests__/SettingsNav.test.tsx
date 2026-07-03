import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      ['Apparence', '#apparence'],
      ['Préférences de notification', '#notifications'],
      ['Cookies', '#cookies'],
      ['Sécurité', '#securite'],
      ['Mes données', '#mes-donnees'],
    ];

    expected.forEach(([label, href], i) => {
      expect(links[i]).toHaveTextContent(label);
      expect(links[i]).toHaveAttribute('href', href);
    });
  });
});
