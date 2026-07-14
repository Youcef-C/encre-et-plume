import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectWorkspaceResponse } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../lib/api', () => ({ getProjectWorkspace: vi.fn() }));

import * as api from '../lib/api';
import PageSwitcher from '../components/editeur/PageSwitcher';

function makeWorkspace(): ProjectWorkspaceResponse {
  return {
    id: 'p', slug: 'lames', workSlug: 'lames', title: 'Lames', synopsis: '', hashtags: [],
    collabOpen: true, visibility: 'public', cover: null, members: [],
    chapters: [
      { id: 'c2', number: 2, title: 'La rencontre', status: 'draft', plancheCount: 2 },
      { id: 'c1', number: 1, title: 'Prologue', status: 'draft', plancheCount: 1 },
    ],
    pages: [
      { id: 'pg1', chapterId: 'c2', title: 'Planche 5', stage: 'scenario', fileTags: ['scenario'], linkedFileIds: [], linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0 },
      { id: 'pg2', chapterId: 'c1', title: 'Planche 1', stage: 'scenario', fileTags: [], linkedFileIds: [], linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0 },
      { id: 'pg3', chapterId: null, title: 'Brouillon', stage: 'scenario', fileTags: [], linkedFileIds: [], linkedFiles: [], dueDate: null, labels: [], assignees: [], checklistDone: 0, checklistTotal: 0, commentCount: 0 },
    ],
    labels: [], reviews: { summary: { overall: 0, story: 0, art: 0, count: 0 }, items: [] },
    viewer: { isMember: true, isOwner: true },
  };
}

describe('PageSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getProjectWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(makeWorkspace());
  });

  it('lazy-loads chapters + pages on open, ordered by chapter number', async () => {
    render(<PageSwitcher slug="lames" currentPageId="pg1" label="Chapitre 2 — La rencontre" />);
    expect(api.getProjectWorkspace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Chapitre 2/ }));
    const listbox = await screen.findByRole('listbox', { name: 'Pages et chapitres' });
    expect(within(listbox).getByText('Chapitre 1 — Prologue')).toBeInTheDocument();
    expect(within(listbox).getByText('Chapitre 2 — La rencontre')).toBeInTheDocument();
    expect(within(listbox).getByText('Sans chapitre')).toBeInTheDocument();
    expect(api.getProjectWorkspace).toHaveBeenCalledTimes(1);
  });

  it('marks the current page and shows the scénario marker', async () => {
    render(<PageSwitcher slug="lames" currentPageId="pg1" label="Chapitre 2 — La rencontre" />);
    await userEvent.click(screen.getByRole('button', { name: /Chapitre 2/ }));
    await waitFor(() => screen.getByRole('option', { name: /Planche 5/ }));
    const current = screen.getByRole('option', { name: /Planche 5/ });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveTextContent('scénario');
  });

  it('navigates to the chosen page', async () => {
    render(<PageSwitcher slug="lames" currentPageId="pg1" label="Chapitre 2 — La rencontre" />);
    await userEvent.click(screen.getByRole('button', { name: /Chapitre 2/ }));
    await waitFor(() => screen.getByRole('option', { name: /Planche 1/ }));
    await userEvent.click(screen.getByRole('option', { name: /Planche 1/ }));
    expect(push).toHaveBeenCalledWith('/projet/lames/editeur/pg2');
  });

  it('does not navigate when the current page is re-selected', async () => {
    render(<PageSwitcher slug="lames" currentPageId="pg1" label="Chapitre 2 — La rencontre" />);
    await userEvent.click(screen.getByRole('button', { name: /Chapitre 2/ }));
    await waitFor(() => screen.getByRole('option', { name: /Planche 5/ }));
    await userEvent.click(screen.getByRole('option', { name: /Planche 5/ }));
    expect(push).not.toHaveBeenCalled();
  });
});
