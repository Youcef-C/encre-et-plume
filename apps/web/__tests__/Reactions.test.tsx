import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import ReactionsAside from '../components/lecteur/ReactionsAside';

const account: AccountSummary = {
  id: 'a1',
  slug: 'camille',
  displayName: 'Camille',
  role: 'utilisateur',
  verified: false,
} as AccountSummary;

describe('ReactionsAside (DR-4 FE-6)', () => {
  const onToggleCollapsed = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders like/favorite counts and an empty comments state', () => {
    render(
      <ReactionsAside likeCount={1800} favoriteCount={340} collapsed={false} onToggleCollapsed={onToggleCollapsed} account={null} />,
    );
    expect(screen.getByRole('button', { name: "J'aime · 1,8k" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favori · 340' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun commentaire/)).toBeInTheDocument();
  });

  it('has a labeled, stubbed comment composer', () => {
    render(
      <ReactionsAside likeCount={0} favoriteCount={0} collapsed={false} onToggleCollapsed={onToggleCollapsed} account={null} />,
    );
    expect(screen.getByLabelText('Commenter')).toBeInTheDocument();
  });

  it('signed-out like click redirects to sign-in', async () => {
    const user = userEvent.setup();
    render(
      <ReactionsAside likeCount={0} favoriteCount={0} collapsed={false} onToggleCollapsed={onToggleCollapsed} account={null} />,
    );
    await user.click(screen.getByRole('button', { name: /J'aime/ }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });

  it('signed-in like click shows a "Bientôt disponible" affordance and does not redirect', async () => {
    const user = userEvent.setup();
    render(
      <ReactionsAside likeCount={0} favoriteCount={0} collapsed={false} onToggleCollapsed={onToggleCollapsed} account={account} />,
    );
    await user.click(screen.getByRole('button', { name: /J'aime/ }));
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('collapsing hides the full panel and shows the mini rail', () => {
    render(
      <ReactionsAside likeCount={0} favoriteCount={0} collapsed={true} onToggleCollapsed={onToggleCollapsed} account={null} />,
    );
    expect(screen.queryByLabelText('Commenter')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Développer' })).toBeInTheDocument();
  });
});
