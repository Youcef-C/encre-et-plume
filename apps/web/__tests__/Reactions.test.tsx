import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, likeReaction: vi.fn(), unlikeReaction: vi.fn(), saveReaction: vi.fn(), unsaveReaction: vi.fn() };
});

import * as api from '../lib/api';
import ReactionsAside from '../components/lecteur/ReactionsAside';

const account: AccountSummary = {
  id: 'a1',
  slug: 'camille',
  displayName: 'Camille',
  role: 'utilisateur',
  verified: false,
} as AccountSummary;

function renderAside(overrides: Partial<React.ComponentProps<typeof ReactionsAside>> = {}) {
  const onToggleCollapsed = vi.fn();
  return render(
    <ReactionsAside
      workSlug="lames-de-brume"
      chapterId="ch-1"
      likeCount={1800}
      favoriteCount={340}
      liked={false}
      saved={false}
      collapsed={false}
      onToggleCollapsed={onToggleCollapsed}
      account={null}
      {...overrides}
    />,
  );
}

describe('ReactionsAside (DR-4 FE-6 / DR-9 FE5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders like/favorite counts and an empty comments state', () => {
    renderAside();
    expect(screen.getByRole('button', { name: "J'aime" })).toHaveTextContent('1,8k');
    expect(screen.getByRole('button', { name: 'Ajouter à ma liste' })).toHaveTextContent('340');
    expect(screen.getByText(/Aucun commentaire/)).toBeInTheDocument();
  });

  it('has a labeled, stubbed comment composer', () => {
    renderAside();
    expect(screen.getByLabelText('Commenter')).toBeInTheDocument();
  });

  it('signed-out ♥ click redirects to sign-in and never calls the API', async () => {
    const user = userEvent.setup();
    renderAside();
    await user.click(screen.getByRole('button', { name: "J'aime" }));
    expect(push).toHaveBeenCalledWith('/connexion');
    expect(api.likeReaction).not.toHaveBeenCalled();
  });

  it('signed-in ♥ click toggles the chapter like: aria-pressed + count + label', async () => {
    const user = userEvent.setup();
    vi.mocked(api.likeReaction).mockResolvedValue({ active: true, count: 1801 });
    renderAside({ account });
    const likeBtn = screen.getByRole('button', { name: "J'aime" });
    await user.click(likeBtn);
    expect(likeBtn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer le j\'aime' })).toHaveTextContent('1,8k'));
    expect(api.likeReaction).toHaveBeenCalledWith({ targetType: 'chapter', targetId: 'ch-1' });
  });

  it('signed-in ★ click toggles the work save', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveReaction).mockResolvedValue({ active: true, count: 341 });
    renderAside({ account });
    await user.click(screen.getByRole('button', { name: 'Ajouter à ma liste' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer de ma liste' })).toHaveTextContent('341'));
    expect(api.saveReaction).toHaveBeenCalledWith({ targetType: 'work', targetId: 'lames-de-brume' });
  });

  it('a rejected ♥ toggle reverts and shows an inline error', async () => {
    const user = userEvent.setup();
    vi.mocked(api.likeReaction).mockRejectedValue(new Error('boom'));
    renderAside({ account });
    await user.click(screen.getByRole('button', { name: "J'aime" }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: "J'aime" })).toHaveAttribute('aria-pressed', 'false');
  });

  it('collapsing hides the full panel and shows the mini rail', () => {
    renderAside({ collapsed: true });
    expect(screen.queryByLabelText('Commenter')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Développer' })).toBeInTheDocument();
  });
});
