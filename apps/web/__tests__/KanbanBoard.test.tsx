import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceChapter, WorkspacePage, ProjectLabelItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePageStage: vi.fn(),
    getPageVersions: vi.fn(),
    getPageDetail: vi.fn(),
    updatePage: vi.fn(),
    createProjectLabel: vi.fn(),
    deleteProjectLabel: vi.fn(),
  };
});

import * as api from '../lib/api';
import KanbanBoard from '../components/projet/KanbanBoard';

const chapters: WorkspaceChapter[] = [
  { id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0 },
  { id: 'c2', number: 1, title: 'La rencontre', status: 'draft', plancheCount: 0 },
];

// New WorkspacePage fields (CS-2 card-modal extension) default to empty so bare cards stay compact.
function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg',
    chapterId: 'c1',
    title: 'Page',
    stage: 'scenario',
    version: 1,
    fileTags: [],
    linkedFileIds: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    ...over,
  };
}

const rouge: ProjectLabelItem = { id: 'lb1', name: 'Urgent', color: '#e8261c' };
const bleu: ProjectLabelItem = { id: 'lb2', name: 'Idée', color: '#3f5aa8' };

const page7 = makePage({ id: 'pg7', chapterId: 'c1', title: 'Page 7', version: 3, fileTags: ['scenario', 'ref', 'double'] });
const page6 = makePage({ id: 'pg6', chapterId: 'c2', title: 'Page 6', stage: 'nemu', version: 2, fileTags: ['nemu'] });

function renderBoard(pages: WorkspacePage[] = [page7, page6], readOnly = false, labels: ProjectLabelItem[] = []) {
  render(
    <KanbanBoard
      slug="nuit-blanche"
      chapters={chapters}
      initialPages={pages}
      readOnly={readOnly}
      labels={labels}
    />,
  );
}

describe('KanbanBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders chapter chips (Prologue / Ch. N) and filters cards by selection', async () => {
    renderBoard();
    expect(screen.getByRole('button', { name: 'Prologue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ch. 1' })).toBeInTheDocument();
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
    (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ id: 'new1', title: 'Page 8' }));
    renderBoard();
    const addButtons = screen.getAllByRole('button', { name: '＋ Ajouter une carte' });
    await userEvent.click(addButtons[0]); // Scénario column
    expect(api.createPage).toHaveBeenCalledWith('nuit-blanche', { chapterId: 'c1', stage: 'scenario' });
    await screen.findByText('Page 8');
  });

  it('un-fades the card after a drag-and-drop (dragend may never fire once it moves)', async () => {
    (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ ...page7, stage: 'nemu' }));
    renderBoard();
    const card = screen.getByText('Page 7').closest('[draggable="true"]') as HTMLElement;
    const dataTransfer = { getData: () => 'pg7', setData: () => {} };
    fireEvent.dragStart(card, { dataTransfer });
    expect(card).toHaveStyle({ opacity: '0.5' });
    fireEvent.drop(screen.getByRole('group', { name: /Nemu/i }), { dataTransfer });
    await waitFor(() => expect(screen.getByText('Page 7').closest('[draggable="true"]')).toHaveStyle({ opacity: '1' }));
  });

  it('moves a card via the ⋯ menu (keyboard path) → updatePageStage', async () => {
    (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ ...page7, stage: 'nemu' }));
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Nemu' }));
    expect(api.updatePageStage).toHaveBeenCalledWith('pg7', 'nemu');
  });

  it('deletes a card via the ⋯ menu → confirmation modal', async () => {
    (api.deletePage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer la carte' }));
    // The inline confirm became a modal alertdialog (user refinement).
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(api.deletePage).toHaveBeenCalledWith('pg7');
    await waitFor(() => expect(screen.queryByText('Page 7')).not.toBeInTheDocument());
  });

  it('reverts the optimistic move and shows an error banner when the stage PATCH fails', async () => {
    (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    renderBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Corrections' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
    expect(screen.getByText('Page 7')).toBeInTheDocument();
  });

  it('shows "Aucune carte" for an empty column', () => {
    renderBoard();
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

  // ── CS-2 card-modal extension ────────────────────────────────────────────────

  it('opens the CardModal when a card is clicked (and drag/⋯/⎘ do not)', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...page7,
      description: 'desc',
      checklist: [],
      comments: [],
    });
    renderBoard();
    // Clicking the version badge must NOT open the modal.
    await userEvent.click(screen.getByRole('button', { name: 'Versions de Page 7' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Clicking the card body opens it.
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir Page 7' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(api.getPageDetail).toHaveBeenCalledWith('pg7');
  });

  it('renders the richer card meta (label bar, due pill + overdue, checklist x/x, comments, avatars) and nothing when bare', () => {
    const rich = makePage({
      id: 'rich',
      title: 'Riche',
      chapterId: 'c1',
      dueDate: '2000-01-05', // in the past → overdue accent styling
      labels: [rouge],
      assignees: [{ accountId: 'u1', displayName: 'Yuki Moreau', avatar: null }],
      checklistDone: 1,
      checklistTotal: 3,
      commentCount: 2,
    });
    renderBoard([rich], false, [rouge]);
    // Label bar carries its name (sr / title).
    expect(screen.getAllByTitle('Urgent').length).toBeGreaterThan(0);
    expect(screen.getByText('(1/3)')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // Overdue pill gets accent background.
    const pill = screen.getByTitle('Échéance');
    expect(pill).toHaveStyle({ background: 'var(--accent)' });
    expect(screen.getByTitle('Yuki Moreau')).toBeInTheDocument();
  });

  it('filters the board by label (auto-apply) and combines with the chapter chips', async () => {
    const a = makePage({ id: 'a', chapterId: 'c1', title: 'Avec', labels: [rouge] });
    const b = makePage({ id: 'b', chapterId: 'c1', title: 'Sans', labels: [bleu] });
    renderBoard([a, b], false, [rouge, bleu]);
    expect(screen.getByText('Avec')).toBeInTheDocument();
    expect(screen.getByText('Sans')).toBeInTheDocument();
    // Filter chip row present; toggling "Urgent" hides the card without that label.
    await userEvent.click(screen.getByRole('button', { name: /Urgent/, pressed: false }));
    expect(screen.getByText('Avec')).toBeInTheDocument();
    expect(screen.queryByText('Sans')).not.toBeInTheDocument();
  });

  it('deletes an étiquette from the filter bar (✕ → confirmation modal → cascades off cards)', async () => {
    (api.deleteProjectLabel as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const withLabel = makePage({ id: 'wl', chapterId: 'c1', title: 'Étiquetée', labels: [rouge] });
    renderBoard([withLabel], false, [rouge]);
    await userEvent.click(screen.getByRole('button', { name: "Supprimer l'étiquette Urgent" }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(api.deleteProjectLabel).toHaveBeenCalledWith('lb1');
    // The palette chip disappears and the card's bar is stripped.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Urgent', pressed: false })).not.toBeInTheDocument());
    expect(screen.queryByTitle('Urgent')).not.toBeInTheDocument();
  });

  it('filters the board by assignee (with a "Moi" chip for the viewer)', async () => {
    const mine = makePage({ id: 'mine', chapterId: 'c1', title: 'À moi', assignees: [{ accountId: 'me', displayName: 'Yuki', avatar: null }] });
    const other = makePage({ id: 'other', chapterId: 'c1', title: 'Autre', assignees: [{ accountId: 'u2', displayName: 'Léo', avatar: null }] });
    render(
      <KanbanBoard
        slug="s"
        chapters={chapters}
        initialPages={[mine, other]}
        members={[
          { accountId: 'me', displayName: 'Yuki', avatar: null, roles: ['scenariste'] },
          { accountId: 'u2', displayName: 'Léo', avatar: null, roles: ['dessinateur'] },
        ]}
        viewerId="me"
      />,
    );
    expect(screen.getByText('À moi')).toBeInTheDocument();
    expect(screen.getByText('Autre')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Moi/, pressed: false }));
    expect(screen.getByText('À moi')).toBeInTheDocument();
    expect(screen.queryByText('Autre')).not.toBeInTheDocument();
  });

  it('raises the open ⋯ menu above sibling cards and closes it on outside click', async () => {
    const p1 = makePage({ id: 'p1', chapterId: 'c1', title: 'Un', stage: 'scenario' });
    const p2 = makePage({ id: 'p2', chapterId: 'c1', title: 'Deux', stage: 'scenario' });
    renderBoard([p1, p2]);
    const menus = screen.getAllByRole('button', { name: 'Menu' });
    await userEvent.click(menus[0]);
    const openCard = screen.getByRole('button', { name: 'Ouvrir Un' });
    expect(openCard).toHaveStyle({ zIndex: '30' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Outside pointerdown closes the menu.
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
