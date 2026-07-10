import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceChapter, WorkspacePage } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePageStage: vi.fn(),
    getPageVersions: vi.fn(),
  };
});

import * as api from '../lib/api';
import KanbanBoard from '../components/projet/KanbanBoard';

const chapters: WorkspaceChapter[] = [
  { id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0 },
  { id: 'c2', number: 1, title: 'La rencontre', status: 'draft', plancheCount: 0 },
];

const page7: WorkspacePage = {
  id: 'pg7',
  chapterId: 'c1',
  title: 'Page 7',
  stage: 'scenario',
  version: 3,
  fileTags: ['scenario', 'ref', 'double'],
  linkedFileIds: [],
};
const page6: WorkspacePage = {
  id: 'pg6',
  chapterId: 'c2',
  title: 'Page 6',
  stage: 'nemu',
  version: 2,
  fileTags: ['nemu'],
  linkedFileIds: [],
};

function renderBoard(pages: WorkspacePage[] = [page7, page6], readOnly = false) {
  render(<KanbanBoard slug="nuit-blanche" chapters={chapters} initialPages={pages} readOnly={readOnly} />);
}

describe('KanbanBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders chapter chips (Prologue / Ch. N) and filters cards by selection', async () => {
    renderBoard();
    expect(screen.getByRole('button', { name: 'Prologue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ch. 1' })).toBeInTheDocument();
    // First chapter (Prologue) selected by default → only its card (Page 7) shows.
    expect(screen.getByText('Page 7')).toBeInTheDocument();
    expect(screen.queryByText('Page 6')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ch. 1' }));
    expect(screen.getByText('Page 6')).toBeInTheDocument();
    expect(screen.queryByText('Page 7')).not.toBeInTheDocument();
  });

  it('renders 6 labelled columns', () => {
    renderBoard();
    const cols = screen.getAllByRole('group');
    expect(cols).toHaveLength(6);
    const names = cols.map((c) => c.getAttribute('aria-label') ?? '').concat(
      cols.map((c) => within(c).getByText(/Scénario|Nemu|Corrections|PROPRE|Encrage|VALIDÉ/).textContent ?? ''),
    );
    ['Scénario', 'Nemu', 'Corrections', 'PROPRE', 'Encrage', 'VALIDÉ'].forEach((n) =>
      expect(names.join(' ')).toContain(n),
    );
  });

  it('renders card anatomy: version badge, tag chips, and 4 action buttons', () => {
    renderBoard();
    expect(screen.getByRole('button', { name: 'Versions de Page 7' })).toHaveTextContent('v3');
    expect(screen.getByText('scénario')).toBeInTheDocument();
    expect(screen.getByText('réf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Éditer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corrections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('adds a card in the clicked column with that stage', async () => {
    (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'new1', chapterId: 'c1', title: 'Page 8', stage: 'scenario', version: 1, fileTags: [], linkedFileIds: [],
    });
    renderBoard();
    const addButtons = screen.getAllByRole('button', { name: '＋ Ajouter une carte' });
    await userEvent.click(addButtons[0]); // Scénario column
    expect(api.createPage).toHaveBeenCalledWith('nuit-blanche', { chapterId: 'c1', stage: 'scenario' });
    await screen.findByText('Page 8');
  });

  it('moves a card via the ⋯ menu (keyboard path) → updatePageStage', async () => {
    (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...page7, stage: 'nemu' });
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nemu' }));
    expect(api.updatePageStage).toHaveBeenCalledWith('pg7', 'nemu');
  });

  it('deletes a card via the ⋯ menu with inline confirm', async () => {
    (api.deletePage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer la carte' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(api.deletePage).toHaveBeenCalledWith('pg7');
    await waitFor(() => expect(screen.queryByText('Page 7')).not.toBeInTheDocument());
  });

  it('reverts the optimistic move and shows an error banner when the stage PATCH fails', async () => {
    (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Corrections' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
    // Card still present under the Prologue selection (reverted to scenario).
    expect(screen.getByText('Page 7')).toBeInTheDocument();
  });

  it('shows "Aucune carte" for an empty column', () => {
    renderBoard();
    // Prologue selected; only Scénario has a card → the other 5 columns are empty.
    expect(screen.getAllByText('Aucune carte').length).toBeGreaterThanOrEqual(5);
  });

  it('fetches versions when the badge is clicked', async () => {
    (api.getPageVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, note: 'Nouvelle révision de fichier', createdAt: '2026-07-01' },
      { version: 1, note: 'Création', createdAt: '2026-06-01' },
    ]);
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Versions de Page 7' }));
    expect(api.getPageVersions).toHaveBeenCalledWith('pg7');
    expect(await screen.findByText(/Création/)).toBeInTheDocument();
  });

  it('read-only viewers get no add / menu controls', () => {
    renderBoard([page7], true);
    expect(screen.queryByRole('button', { name: '＋ Ajouter une carte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });
});
