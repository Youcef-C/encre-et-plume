// DR-5 FE-5 — gallery header. Replica of prototype GALERIE lines 596-597: "Galerie" + derived
// summary + subtitle + "＋ Publier une illustration" CTA (auth-gated entry point into CS-3).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionContext } from '../lib/session';
import GalerieHeader from '../components/galerie/GalerieHeader';

const summary = { illustrationCount: 14, artistCount: 7 };

function renderWithSession(account: unknown) {
  return render(
    <SessionContext.Provider value={{ account: account as never, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <GalerieHeader summary={summary} />
    </SessionContext.Provider>,
  );
}

describe('GalerieHeader (DR-5 FE-5)', () => {
  it('renders the derived "N illustrations · N artistes" summary (not the prototype literals)', () => {
    renderWithSession(null);
    expect(screen.getByText('14 illustrations · 7 artistes')).toBeInTheDocument();
  });

  it('renders the verbatim subtitle', () => {
    renderWithSession(null);
    expect(
      screen.getByText('Toutes les illustrations de la communauté — couvertures, personnages, décors & fan-art.'),
    ).toBeInTheDocument();
  });

  it('anonymous: the CTA gates to /connexion with the encoded wizard deep-link (CS-1)', () => {
    renderWithSession(null);
    expect(screen.getByRole('link', { name: '＋ Publier une illustration' })).toHaveAttribute(
      'href',
      `/connexion?next=${encodeURIComponent('/creer?type=illustration')}`,
    );
  });

  it('signed-in: the CTA deep-links into the wizard Illustration branch (/creer?type=illustration)', () => {
    renderWithSession({ id: 'u1' });
    expect(screen.getByRole('link', { name: '＋ Publier une illustration' })).toHaveAttribute(
      'href',
      '/creer?type=illustration',
    );
  });
});
