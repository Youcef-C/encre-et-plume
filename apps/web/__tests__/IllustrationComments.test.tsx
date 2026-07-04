// DR-6 FE-T3 (FE-5, FE-10, FE-11) — comments empty state + stub composer.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IllustrationComments from '../components/illustration/IllustrationComments';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('IllustrationComments (DR-6 FE-5)', () => {
  it('shows the header count and the empty state', () => {
    render(<IllustrationComments account={null} />);
    expect(screen.getByRole('heading', { level: 2, name: /Commentaires/ })).toBeInTheDocument();
    expect(screen.getByText(/Aucun commentaire pour le moment/)).toBeInTheDocument();
  });

  it('has a labeled composer input', () => {
    render(<IllustrationComments account={null} />);
    expect(screen.getByLabelText('Ajouter un commentaire')).toBeInTheDocument();
  });

  it('anonymous "Publier" routes to sign-in', async () => {
    const user = userEvent.setup();
    render(<IllustrationComments account={null} />);
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });
});
