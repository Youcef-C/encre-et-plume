import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WorkspaceChapter, WorkspacePage, ProjectLabelItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createPage: vi.fn(),
    deletePage: vi.fn(),
    updatePageStage: vi.fn(),
    getPageDetail: vi.fn(),
    listProjectAssets: vi.fn(),
    updatePage: vi.fn(),
    createProjectLabel: vi.fn(),
    deleteProjectLabel: vi.fn(),
    createChapter: vi.fn(),
    getProjectWorkspace: vi.fn(),
    // CS-20 — the handoff pin: the banner's compare modal and the acknowledge write.
    getAssetVersions: vi.fn(),
    getReview: vi.fn(),
    acknowledgeHandoff: vi.fn(),
  };
});

import * as api from '../lib/api';
import KanbanBoard from '../components/projet/KanbanBoard';

// R3-2: `targetPages` is NOT NULL (default 20), so every chapter has a real percentage and a bar.
const chapters: WorkspaceChapter[] = [
  { id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0, targetPages: 10, progressPct: 40 },
  { id: 'c2', number: 1, title: 'La rencontre', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 },
];

// New WorkspacePage fields (CS-2 card-modal extension) default to empty so bare cards stay compact.
function makePage(over: Partial<WorkspacePage>): WorkspacePage {
  return {
    id: 'pg',
    chapterId: 'c1',
    title: 'Page',
    stage: 'scenario',
    position: 0,
    fileTags: [],
    linkedFileIds: [],
    linkedFiles: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    openCorrectionCount: 0,
    openCorrectionTypes: [],
    createdById: null,
    handoff: null,
    scenarioUnsaved: false,
    ...over,
  };
}

const rouge: ProjectLabelItem = { id: 'lb1', name: 'Urgent', color: '#e8261c' };
const bleu: ProjectLabelItem = { id: 'lb2', name: 'Idée', color: '#3f5aa8' };

const page7 = makePage({
  id: 'pg7',
  chapterId: 'c1',
  title: 'Page 7',
  fileTags: ['scenario', 'ref', 'double'],
  linkedFiles: [
    { assetId: 'a1', type: 'scenario', filename: 'scenario.txt', version: 3 },
    { assetId: 'a2', type: 'ref', filename: 'ref.png', version: 1 },
  ],
});
const page6 = makePage({ id: 'pg6', chapterId: 'c2', title: 'Page 6', stage: 'nemu', fileTags: ['nemu'] });

function renderBoard(
  pages: WorkspacePage[] = [page7, page6],
  readOnly = false,
  labels: ProjectLabelItem[] = [],
  // CS-10 D-1: the delete affordance needs to know who the viewer is and whether they lead the group.
  extra: {
    canManage?: boolean;
    viewerId?: string | null;
    chapters?: WorkspaceChapter[];
    onWorkspaceStale?: () => void;
  } = { canManage: true },
) {
  render(
    <KanbanBoard
      slug="nuit-blanche"
      chapters={extra.chapters ?? chapters}
      initialPages={pages}
      readOnly={readOnly}
      labels={labels}
      canManage={extra.canManage ?? false}
      viewerId={extra.viewerId ?? null}
      onWorkspaceStale={extra.onWorkspaceStale}
    />,
  );
}

// R5-3 — the two move actions live in nested submenus now, so every stage move goes
// ⋯ → « Déplacer vers une colonne » → the stage.
async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
}
async function moveToColumn(stage: string) {
  await openMenu();
  await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' }));
  await userEvent.click(screen.getByRole('menuitem', { name: stage }));
}

describe('KanbanBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  // R2-1d (user rule, 2026-07-31): every card belongs to a chapter, so the board offers NO orphan
  // bucket — round 1's "Sans chapitre" chip is gone and the chip row is chapters only.
  it('offers no "Sans chapitre" bucket — the chip row is chapters only', () => {
    renderBoard();
    expect(screen.queryByRole('button', { name: 'Sans chapitre' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prologue' })).toHaveAttribute('aria-pressed', 'true');
  });

  // ── R2 · a chapter is a prerequisite for a card ─────────────────────────────
  describe('chapter prerequisite (R2-1 / R2-2 / R2-3)', () => {
    const newChapter = { id: 'c9', number: 1, title: 'Chapitre 1', status: 'draft', plancheCount: 0 } as WorkspaceChapter;

    it('with zero chapters, the empty state REPLACES the board (no columns at all)', () => {
      renderBoard([], false, [], { canManage: true, chapters: [] });
      expect(screen.getByText('Aucun chapitre pour l’instant')).toBeInTheDocument();
      expect(screen.getByText('Créez un premier chapitre pour organiser vos planches.')).toBeInTheDocument();
      // No card creation at all — the server 400s it (R2-1), so never offer it.
      expect(screen.queryByRole('button', { name: '＋ Ajouter une carte' })).not.toBeInTheDocument();
      // The columns are NOT rendered: a disabled board under the card squashed it (user, 2026-07-31).
      expect(screen.queryAllByRole('group')).toHaveLength(0);
    });

    it('the empty-state CTA creates a chapter in one click and unlocks the board', async () => {
      (api.createChapter as ReturnType<typeof vi.fn>).mockResolvedValue({ ...newChapter, resume: null });
      renderBoard([], false, [], { canManage: true, chapters: [] });

      await userEvent.click(screen.getByRole('button', { name: 'Créer un chapitre' }));
      // No form, no number computed in the browser — the server assigns it.
      expect(api.createChapter).toHaveBeenCalledWith('nuit-blanche', {});
      await waitFor(() => expect(screen.queryByText('Aucun chapitre pour l’instant')).not.toBeInTheDocument());
      // …and it is the selected chapter, so cards can be added again.
      expect(screen.getByRole('button', { name: 'Ch. 1' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByRole('button', { name: '＋ Ajouter une carte' })).toHaveLength(6);
    });

    it('the "＋" chip creates a chapter and selects it, without a form or a tab switch', async () => {
      (api.createChapter as ReturnType<typeof vi.fn>).mockResolvedValue({ ...newChapter, id: 'c3', number: 3, title: 'Chapitre 3' });
      renderBoard();
      expect(screen.getByRole('button', { name: 'Prologue' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Ajouter un chapitre' }));
      expect(api.createChapter).toHaveBeenCalledWith('nuit-blanche', {});
      const chip = await screen.findByRole('button', { name: 'Ch. 3' });
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Prologue' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('hides both affordances for a non-writer', () => {
      renderBoard([], true, [], { canManage: false, chapters: [] });
      expect(screen.getByText('Aucun chapitre pour l’instant')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Créer un chapitre' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Ajouter un chapitre' })).not.toBeInTheDocument();
    });

    it('with ≥1 chapter the board is normal and cards are always chapter-scoped', async () => {
      // Stub the resolved page: addCard appends whatever createPage returns, so an unstubbed mock
      // pushes `undefined` into `pages` and the next render throws on `p.chapterId`. That surfaces
      // as a Vitest *unhandled error* (exit 1) while every test still reports green — same pattern
      // as the sibling test below.
      (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ id: 'new0', title: 'Page 9' }));
      renderBoard([page7, page6]);
      expect(screen.queryByText('Aucun chapitre pour l’instant')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: '＋ Ajouter une carte' })).toHaveLength(6);
      expect(api.createPage).not.toHaveBeenCalled();

      await userEvent.click(screen.getAllByRole('button', { name: '＋ Ajouter une carte' })[0]);
      // A card is never created without a chapter — the selected one is always sent.
      expect(api.createPage).toHaveBeenCalledWith('nuit-blanche', { chapterId: 'c1', stage: 'scenario' });
    });
  });

  // R2-8b/c — the chip carries a thin progress bar. R3-2: EVERY chapter has one now.
  describe('chip progress bar (R2-8 / R3-2 / R3-3)', () => {
    it('draws a bar for every chapter, with the value exposed as text', () => {
      // 2 linked cards, 1 at the terminal stage, against c1's 10 planned → 10 %.
      renderBoard([makePage({ id: 'p1', chapterId: 'c1', stage: 'valide' }), makePage({ id: 'p2', chapterId: 'c1' })]);
      const bar = screen.getByRole('progressbar', { name: /Prologue/ });
      expect(bar).toHaveAttribute('aria-valuenow', '10');
      expect(bar).toHaveTextContent('10%'); // not colour-only
      // R3-2 reverses R2-8b's "hidden without a target": the chapter nobody planned still shows one.
      expect(screen.getByRole('progressbar', { name: /Ch\. 1/ })).toHaveAttribute('aria-valuenow', '0');
      expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    });

    // R3-3 (bug): the bar was derived server-side and arrived as a prop, while the board mutates its
    // own `pages` locally — so it stayed stale until a manual reload. It is now derived from the
    // pages the board already holds, which makes it react to EVERY local mutation.
    it('advances when a card moves to VALIDÉ, with no refetch', async () => {
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1', stage: 'nemu' });
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, stage: 'valide' });
      renderBoard([card]);
      expect(screen.getByRole('progressbar', { name: /Prologue/ })).toHaveAttribute('aria-valuenow', '0');

      await moveToColumn('VALIDÉ');

      await waitFor(() =>
        expect(screen.getByRole('progressbar', { name: /Prologue/ })).toHaveAttribute('aria-valuenow', '10'),
      );
      expect(api.getProjectWorkspace).not.toHaveBeenCalled(); // derived locally, never refetched
    });

    it('updates BOTH chapters when a card is moved from one to the other (R2-5)', async () => {
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1', stage: 'valide' });
      (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, description: '', checklist: [], comments: [] });
      (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 1 });
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, chapterId: 'c2' });
      renderBoard([card]);
      expect(screen.getByRole('progressbar', { name: /Prologue/ })).toHaveAttribute('aria-valuenow', '10');
      expect(screen.getByRole('progressbar', { name: /Ch\. 1/ })).toHaveAttribute('aria-valuenow', '0');

      // The card modal bubbles the moved card up through onPageChange — the bars follow both ways.
      await userEvent.click(screen.getByText('Page 1'));
      await userEvent.click(await screen.findByRole('combobox', { name: 'Chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Ch. 1 — La rencontre' }));

      await waitFor(() =>
        expect(screen.getByRole('progressbar', { name: /Ch\. 1/ })).toHaveAttribute('aria-valuenow', '5'),
      );
      expect(screen.getByRole('progressbar', { name: /Prologue/ })).toHaveAttribute('aria-valuenow', '0');
    });
  });

  // R3-1 — the chips were scaled back down from R2-8c. The size has to live in CSS: an inline
  // min-height cannot be raised to the 44px tap-target floor by the mobile media query (the R2-4
  // lesson). Guard against the inline value coming back.
  it('keeps the chapter chip sizing in CSS, not inline (raisable to 44px on mobile)', () => {
    renderBoard();
    const chip = screen.getByRole('button', { name: 'Prologue' });
    expect(chip).toHaveClass('ep-chapter-chip');
    expect(chip.style.minHeight).toBe('');
    expect(chip.style.padding).toBe('');
  });

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

  it('renders card anatomy: derived version badge, per-file chips, and 4 action buttons', () => {
    renderBoard();
    // Badge = max linked-file version (3, 1) → v3; not interactive (no popover).
    const badge = screen.getByText('⎘ v3');
    expect(badge.tagName).toBe('SPAN');
    // Per-file chips carry the file's own version.
    expect(screen.getByText('scénario v3')).toBeInTheDocument();
    expect(screen.getByText('réf v1')).toBeInTheDocument();
    // manual scenario/ref fileTags are hidden (covered by a linked file); Double page still shows.
    expect(screen.getByText('Double')).toBeInTheDocument();
    // CS-4: the ✎ pen is now a link into the collaborative editor for this card's scenario.
    expect(screen.getByRole('link', { name: 'Éditer le scénario' })).toHaveAttribute('href', '/projet/nuit-blanche/editeur/pg7');
    expect(screen.getByRole('button', { name: 'Aperçu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Corrections' })).toHaveAttribute('href', '/projet/nuit-blanche/revision/pg7');
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('shows no version badge when the card has no linked files', () => {
    renderBoard([makePage({ id: 'bare', chapterId: 'c1', title: 'Nue' })]);
    expect(screen.queryByText(/⎘ v/)).not.toBeInTheDocument();
  });

  it('shows a manual nemu fileTag only until a dessin file is linked', () => {
    const p = makePage({
      id: 'n',
      chapterId: 'c1',
      title: 'Nemu carte',
      fileTags: ['nemu'],
      linkedFiles: [{ assetId: 'd1', type: 'dessin', filename: 'nemu.png', version: 2 }],
    });
    renderBoard([p]);
    // The dessin chip carries the version; the bare "nemu" tag chip is hidden.
    expect(screen.getByText('dessin v2')).toBeInTheDocument();
    expect(screen.queryByText('nemu')).not.toBeInTheDocument();
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
    await moveToColumn('Nemu');
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
    await moveToColumn('Corrections');
    expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
    expect(screen.getByText('Page 7')).toBeInTheDocument();
  });

  // ── CS-26 — the terminal column is gated, and the block is pre-empted on the card face ─────
  describe('CS-26 — VALIDÉ gate', () => {
    const encrage = makePage({ id: 'pg7', chapterId: 'c1', title: 'Page 7', stage: 'encrage', openCorrectionCount: 2 });

    it('a 409 « Corrections non résolues » reverts the move and names the count + a link to the corrections', async () => {
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 409, message: 'Corrections non résolues', unresolved: 2 });
      renderBoard([encrage]);
      await moveToColumn('VALIDÉ');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Corrections non résolues (2)');
      expect(within(alert).getByRole('link', { name: 'Voir les corrections' })).toHaveAttribute('href', '/projet/nuit-blanche/revision/pg7');
      // reverted: the card is back under Encrage, not VALIDÉ
      expect(within(screen.getByRole('group', { name: /Encrage/i })).getByText('Page 7')).toBeInTheDocument();
      expect(within(screen.getByRole('group', { name: /VALIDÉ/i })).queryByText('Page 7')).not.toBeInTheDocument();
    });

    it('any other failure keeps the generic message (no unresolved count, no link)', async () => {
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 500, message: 'Erreur réseau' });
      renderBoard([encrage]);
      await moveToColumn('VALIDÉ');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/a échoué/);
      expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
    });

    // F5 — "reachable and dismissible at every width": both banner shapes carry the same close control.
    it('the block banner is dismissible — « Fermer » removes it', async () => {
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 409, message: 'Corrections non résolues', unresolved: 2 });
      renderBoard([encrage]);
      await moveToColumn('VALIDÉ');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Corrections non résolues (2)');
      await userEvent.click(within(alert).getByRole('button', { name: 'Fermer' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('the generic failure banner is dismissible too', async () => {
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 500, message: 'Erreur réseau' });
      renderBoard([encrage]);
      await moveToColumn('VALIDÉ');
      const alert = await screen.findByRole('alert');
      await userEvent.click(within(alert).getByRole('button', { name: 'Fermer' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the open-corrections count on the card face', () => {
      renderBoard([encrage]);
      expect(screen.getByTitle('Corrections ouvertes')).toHaveTextContent('2');
    });

    it('renders no count chip when there are no open corrections against the current version', () => {
      renderBoard([makePage({ id: 'pg7', title: 'Page 7', stage: 'encrage', openCorrectionCount: 0 })]);
      expect(screen.queryByTitle('Corrections ouvertes')).not.toBeInTheDocument();
    });

    // Feedback round 2 (2026-09-01) — the card face stays icon+count only; the correction file
    // types show in the card modal's FICHIERS sections, never as chips on the card.
    it('renders no type chips on the card face even when openCorrectionTypes is set', () => {
      renderBoard([makePage({ id: 'pg7', title: 'Page 7', stage: 'encrage', openCorrectionCount: 2, openCorrectionTypes: ['dessin', 'scenario'] })]);
      expect(screen.getByTitle('Corrections ouvertes')).toHaveTextContent('2');
      expect(screen.queryByText('dessin')).not.toBeInTheDocument();
      expect(screen.queryByText('scénario')).not.toBeInTheDocument();
    });
  });

  it('shows "Aucune carte" for an empty column', () => {
    renderBoard();
    expect(screen.getAllByText('Aucune carte').length).toBeGreaterThanOrEqual(5);
  });

  it('read-only viewers get no add / menu controls', () => {
    // A non-member viewer: no « Écriture », no leadership, not the card's author → nothing to offer.
    renderBoard([page7], true, [], { canManage: false, viewerId: null });
    expect(screen.queryByRole('button', { name: '＋ Ajouter une carte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
  });

  // ── CS-2 card-modal extension ────────────────────────────────────────────────

  it('opens the CardModal when a card is clicked', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...page7,
      description: 'desc',
      checklist: [],
      comments: [],
    });
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0 });
    renderBoard();
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
    const onWorkspaceStale = vi.fn();
    const withLabel = makePage({ id: 'wl', chapterId: 'c1', title: 'Étiquetée', labels: [rouge] });
    renderBoard([withLabel], false, [rouge], { canManage: true, onWorkspaceStale });
    await userEvent.click(screen.getByRole('button', { name: "Supprimer l'étiquette Urgent" }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(api.deleteProjectLabel).toHaveBeenCalledWith('lb1');
    // The palette chip disappears and the card's bar is stripped.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Urgent', pressed: false })).not.toBeInTheDocument());
    expect(screen.queryByTitle('Urgent')).not.toBeInTheDocument();
    // R4-1: the palette lives in `workspace.labels` too — same seam, or the chip returns on remount.
    expect(onWorkspaceStale).toHaveBeenCalled();
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

  // ── R5-1 / R5-2 / R5-3 — the ⋯ menu is the documented keyboard path for moving a card ──────────
  describe('⋯ menu (R5-1 placement, R5-2 chapter move, R5-3 submenus)', () => {
    const ZERO = { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
    const rect = (o: Partial<DOMRect>) => ({ ...ZERO, ...o }) as DOMRect;

    let rectSpy: { mockRestore: () => void } | null = null;

    /** jsdom gives every box a zero rect — stub the trigger and the measured menus instead. */
    function stubGeometry(trigger: Partial<DOMRect>, menuHeight: number, submenuHeight = menuHeight) {
      rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this.getAttribute('aria-label') === 'Menu') return rect(trigger);
        if (this.getAttribute('role') === 'menu') {
          // The root menu is « Actions de la carte »; a submenu is named after its parent item.
          const h = this.getAttribute('aria-label') === 'Actions de la carte' ? menuHeight : submenuHeight;
          return rect({ top: 0, bottom: h, height: h, width: 190, right: 190 });
        }
        return ZERO;
      });
    }
    afterEach(() => {
      rectSpy?.mockRestore();
      rectSpy = null;
    });

    // R5-1 (bug): `top` was `trigger.bottom + 4` with no viewport check, and the menu is
    // position:fixed in a portal — so the lower items (delete worst of all, being last) were
    // unreachable for a card near the bottom of the screen.
    it('flips the menu ABOVE the trigger when it would overflow the viewport bottom', async () => {
      window.innerHeight = 768;
      stubGeometry({ top: 700, bottom: 722, left: 274, right: 300, width: 26, height: 22 }, 200);
      renderBoard();
      await openMenu();
      // 700 - 4 - 200 = 496, fully inside the viewport (the old code produced 726 → 926px bottom).
      expect(screen.getByRole('menu')).toHaveStyle({ top: '496px' });
    });

    it('clamps into the viewport when the menu fits neither below nor above', async () => {
      window.innerHeight = 768;
      stubGeometry({ top: 700, bottom: 722, left: 274, right: 300, width: 26, height: 22 }, 700);
      renderBoard();
      await openMenu();
      const menu = screen.getByRole('menu');
      expect(menu).toHaveStyle({ top: '60px' }); // 768 - 700 - 8
      // …and it can never be taller than the viewport: a long list scrolls INSIDE it.
      expect(menu).toHaveStyle({ maxHeight: '752px', overflowY: 'auto' });
    });

    it('clamps a long chapter submenu into the viewport too', async () => {
      window.innerHeight = 768;
      stubGeometry({ top: 700, bottom: 722, left: 274, right: 300, width: 26, height: 22 }, 200, 900);
      renderBoard();
      await openMenu();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' }));
      const sub = screen.getByRole('menu', { name: 'Déplacer vers un chapitre' });
      expect(sub).toHaveStyle({ top: '8px', maxHeight: '752px', overflowY: 'auto' });
    });

    // R5-2 — the same PATCH the card modal's « CHAPITRE » select uses. One code path, two entries.
    it('moves the card to another chapter through the same PATCH the card modal uses', async () => {
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' });
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, chapterId: 'c2' });
      const onWorkspaceStale = vi.fn();
      renderBoard([card], false, [], { canManage: true, onWorkspaceStale });

      await openMenu();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Ch. 1 — La rencontre' }));

      expect(api.updatePage).toHaveBeenCalledWith('p1', { chapterId: 'c2' });
      // It leaves the selected chapter's board, and BOTH progress bars follow (R3-3).
      await waitFor(() => expect(screen.queryByText('Page 1')).not.toBeInTheDocument());
      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    it('never offers the card’s current chapter as a destination (no-op move)', async () => {
      renderBoard([makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' })]);
      await openMenu();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' }));
      expect(screen.queryByRole('menuitem', { name: /Prologue/ })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Ch. 1 — La rencontre' })).toBeInTheDocument();
    });

    it('reverts the optimistic chapter move and reports it when the PATCH fails', async () => {
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' });
      (api.updatePage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
      renderBoard([card]);
      await openMenu();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Ch. 1 — La rencontre' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
      expect(screen.getByText('Page 1')).toBeInTheDocument();
    });

    // R5-3 — this menu is the documented NON-drag path, so keyboard operability is functional.
    it('is keyboard operable end to end: arrows within a level, Right opens, Enter picks', async () => {
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' });
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, chapterId: 'c2' });
      renderBoard([card]);

      await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
      expect(screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' })).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      const chapterParent = screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' });
      expect(chapterParent).toHaveFocus();
      expect(chapterParent).toHaveAttribute('aria-haspopup', 'menu');
      expect(chapterParent).toHaveAttribute('aria-expanded', 'false');

      await userEvent.keyboard('{ArrowRight}');
      expect(chapterParent).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menuitem', { name: 'Ch. 1 — La rencontre' })).toHaveFocus();
      // Arrows stay INSIDE the open submenu (they never leak back to the parent level).
      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Ch. 1 — La rencontre' })).toHaveFocus(); // only one destination

      await userEvent.keyboard('{Enter}');
      expect(api.updatePage).toHaveBeenCalledWith('p1', { chapterId: 'c2' });
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    it('Escape unwinds one level at a time and hands focus back to the ⋯ trigger', async () => {
      renderBoard([makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' })]);
      const trigger = screen.getByRole('button', { name: 'Menu' });
      await userEvent.click(trigger);
      const parent = screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' });
      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getAllByRole('menu')).toHaveLength(2);

      await userEvent.keyboard('{Escape}');
      expect(screen.getAllByRole('menu')).toHaveLength(1);
      expect(parent).toHaveFocus();

      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
      // The card modal must NOT have opened behind it.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // R7-3 — hover AND focus highlight come from the shared `.ep-menu-item` class (globals.css:642),
    // which this menu never picked up. Asserted as wiring, not computed colour: an inline
    // `background`/`color` would out-rank the class rule and silently kill both states, and focus
    // matters most here — this is the documented keyboard path for moving a card.
    it('gives every menu and submenu item the shared .ep-menu-item hover/focus class', async () => {
      renderBoard([makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1', createdById: 'me' })], false, [], {
        canManage: false,
        viewerId: 'me',
      });
      await openMenu();

      const parent = screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' });
      expect(parent).toHaveClass('ep-menu-item');
      expect(parent.style.background).toBe('');
      expect(parent.style.backgroundColor).toBe('');

      // The destructive item keeps its own idiom (fills solid danger) rather than the neutral hover.
      const del = screen.getByRole('menuitem', { name: 'Supprimer la carte' });
      expect(del).toHaveClass('ep-menu-item', 'ep-menu-item--danger');
      expect(del.style.color).toBe('');

      await userEvent.click(parent);
      const items = screen.getAllByRole('menuitem');
      expect(items.length).toBeGreaterThan(3);
      for (const item of items) {
        expect(item).toHaveClass('ep-menu-item');
        expect(item.style.background).toBe('');
      }
      // Keyboard focus lands on a class-styled item, so it highlights exactly like hover.
      expect(document.activeElement).toHaveClass('ep-menu-item');
    });
  });

  // ── CS-10 D-1 — the card delete affordance mirrors the server rule ─────────────────────────────
  // Server: leader ∪ co-leader ∪ owner may delete ANY card; everyone else only the cards they
  // created; a card with no recorded author is leadership-only. The UI mirrors it so it never offers
  // an action that would 403 — defence in depth, never the only gate.
  describe('delete affordance (CS-10 D-1)', () => {
    const mine = makePage({ id: 'pg-mine', chapterId: 'c1', title: 'Ma carte', createdById: 'me' });
    const theirs = makePage({ id: 'pg-theirs', chapterId: 'c1', title: 'Leur carte', createdById: 'yuki' });
    const orphan = makePage({ id: 'pg-orphan', chapterId: 'c1', title: 'Carte orpheline', createdById: null });

    const openMenu = async () => userEvent.click(screen.getByRole('button', { name: 'Menu' }));

    it('offers « Supprimer la carte » on a card the viewer created', async () => {
      renderBoard([mine], false, [], { canManage: false, viewerId: 'me' });
      await openMenu();
      expect(screen.getByRole('menuitem', { name: 'Supprimer la carte' })).toBeInTheDocument();
    });

    it("hides it on someone else's card for a plain « Écriture » member", async () => {
      renderBoard([theirs], false, [], { canManage: false, viewerId: 'me' });
      await openMenu();
      expect(screen.queryByRole('menuitem', { name: 'Supprimer la carte' })).not.toBeInTheDocument();
      // the move items are still there — they only need « Écriture »
      expect(screen.getByRole('menuitem', { name: 'Déplacer vers une colonne' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Déplacer vers un chapitre' })).toBeInTheDocument();
    });

    it("offers it to a leader / co-leader on someone else's card", async () => {
      renderBoard([theirs], false, [], { canManage: true, viewerId: 'me' });
      await openMenu();
      expect(screen.getByRole('menuitem', { name: 'Supprimer la carte' })).toBeInTheDocument();
    });

    it('treats a card with no recorded author as leadership-only', async () => {
      renderBoard([orphan], false, [], { canManage: false, viewerId: 'me' });
      await openMenu();
      expect(screen.queryByRole('menuitem', { name: 'Supprimer la carte' })).not.toBeInTheDocument();
    });

    it('keeps the author\'s own delete reachable without « Écriture », with no move items', async () => {
      renderBoard([mine], true, [], { canManage: false, viewerId: 'me' });
      await openMenu();
      expect(screen.getByRole('menuitem', { name: 'Supprimer la carte' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Nemu' })).not.toBeInTheDocument();
    });

    it('offers no ⋯ menu at all to a read-only viewer with nothing to delete', () => {
      renderBoard([theirs], true, [], { canManage: false, viewerId: 'me' });
      expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    });
  });

  // ── R4-1 — every board mutation rings the `onWorkspaceStale` seam ─────────────────────────────
  // ProjectWorkspace renders the board conditionally, so leaving the Tableau unmounts it and coming
  // back re-seeds `pages` from `workspace.pages`. CS-7 built `onWorkspaceStale` to cure exactly that
  // and wired it to ChaptersPanel only, so chapter mutations refreshed the payload and card
  // mutations did not — a created card vanished on the way back. The seam is now rung by every
  // persisted mutation the board owns. (The round trip itself is asserted in ProjectWorkspace.test.)
  describe('workspace staleness seam (R4-1)', () => {
    const spy = () => vi.fn();

    it('rings it after a card is created', async () => {
      const onWorkspaceStale = spy();
      (api.createPage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ id: 'new1', title: 'Page 8' }));
      renderBoard([page7], false, [], { canManage: true, onWorkspaceStale });

      await userEvent.click(screen.getAllByRole('button', { name: '＋ Ajouter une carte' })[0]);
      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    it('rings it after a card is deleted', async () => {
      const onWorkspaceStale = spy();
      (api.deletePage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      renderBoard([page7], false, [], { canManage: true, onWorkspaceStale });

      await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer la carte' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    it('rings it after a stage change', async () => {
      const onWorkspaceStale = spy();
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue(makePage({ ...page7, stage: 'nemu' }));
      renderBoard([page7], false, [], { canManage: true, onWorkspaceStale });

      await moveToColumn('Nemu');
      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    it('rings it after an R2-5 chapter move from the card modal', async () => {
      const onWorkspaceStale = spy();
      const card = makePage({ id: 'p1', chapterId: 'c1', title: 'Page 1' });
      (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, description: '', checklist: [], comments: [] });
      (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 1 });
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...card, chapterId: 'c2' });
      renderBoard([card], false, [], { canManage: true, onWorkspaceStale });

      await userEvent.click(screen.getByText('Page 1'));
      await userEvent.click(await screen.findByRole('combobox', { name: 'Chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Ch. 1 — La rencontre' }));

      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    // Same defect class, same seam: the quick-created chapter's chip lives in local state too.
    it('rings it after the "＋" chip quick-creates a chapter', async () => {
      const onWorkspaceStale = spy();
      (api.createChapter as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'c3', number: 3, title: 'Chapitre 3', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0, resume: null,
      });
      renderBoard([page7], false, [], { canManage: true, onWorkspaceStale });

      await userEvent.click(screen.getByRole('button', { name: 'Ajouter un chapitre' }));
      await waitFor(() => expect(onWorkspaceStale).toHaveBeenCalledTimes(1));
    });

    // Nothing was persisted, so nothing is stale — refetching would only undo the local revert.
    it('does NOT ring it when the write fails', async () => {
      const onWorkspaceStale = spy();
      (api.updatePageStage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
      renderBoard([page7], false, [], { canManage: true, onWorkspaceStale });

      await moveToColumn('Corrections');
      expect(await screen.findByRole('alert')).toHaveTextContent(/a échoué/);
      expect(onWorkspaceStale).not.toHaveBeenCalled();
    });
  });

  // ── CS-20 — the scenario handoff pin ───────────────────────────────────────
  describe('CS-20 — handoff pin', () => {
    const stale = makePage({
      id: 'pg7',
      chapterId: 'c1',
      title: 'Page 7',
      stage: 'nemu',
      handoff: { assetId: 'as-1', version: 2, headVersion: 5, stale: true },
    });

    beforeEach(() => {
      (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
        { version: 5, note: null },
        { version: 2, note: null },
      ]);
      (api.getReview as ReturnType<typeof vi.fn>).mockResolvedValue({
        selected: { fromHtml: '<p>v2</p>', toHtml: '<p>v5</p>' },
      });
    });

    it('shows the quiet staleness marker with the version pair on the card face', () => {
      renderBoard([stale]);
      expect(screen.getByText('Le scénario a changé depuis la passation')).toBeInTheDocument();
      expect(screen.getByText('v2 → v5')).toBeInTheDocument();
    });

    it('renders nothing when the pin is at head, and nothing when there is no pin', () => {
      renderBoard([makePage({ id: 'pg7', title: 'Page 7', handoff: { assetId: 'as-1', version: 5, headVersion: 5, stale: false } })]);
      expect(screen.queryByText('Le scénario a changé depuis la passation')).not.toBeInTheDocument();
      cleanup();
      renderBoard([makePage({ id: 'pg8', title: 'Page 8' })]);
      expect(screen.queryByText('Le scénario a changé depuis la passation')).not.toBeInTheDocument();
    });

    it('clicking the marker opens the EXISTING compare modal on pinned ↔ head', async () => {
      renderBoard([stale]);
      await userEvent.click(screen.getByRole('button', { name: /Le scénario a changé depuis la passation/ }));
      expect(await screen.findByRole('dialog', { name: /Comparer les versions/i })).toBeInTheDocument();
      await waitFor(() => expect(api.getReview).toHaveBeenCalledWith('pg7', { file: 'as-1', from: 2, to: 5 }));
      // …and it did NOT open the card modal underneath.
      expect(api.getPageDetail).not.toHaveBeenCalled();
    });

    it('« J’ai pris connaissance » re-pins to head and clears the marker', async () => {
      (api.acknowledgeHandoff as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...stale,
        handoff: { assetId: 'as-1', version: 5, headVersion: 5, stale: false },
      });
      renderBoard([stale]);
      await userEvent.click(screen.getByRole('button', { name: /Le scénario a changé depuis la passation/ }));
      await screen.findByRole('dialog', { name: /Comparer les versions/i });
      await userEvent.click(screen.getByRole('button', { name: 'J’ai pris connaissance' }));
      await waitFor(() => expect(api.acknowledgeHandoff).toHaveBeenCalledWith('pg7'));
      await waitFor(() => expect(screen.queryByText('Le scénario a changé depuis la passation')).not.toBeInTheDocument());
    });

    it('a read-only viewer still SEES the marker but is offered no acknowledge', async () => {
      renderBoard([stale], true, [], { canManage: false, viewerId: null });
      await userEvent.click(screen.getByRole('button', { name: /Le scénario a changé depuis la passation/ }));
      await screen.findByRole('dialog', { name: /Comparer les versions/i });
      expect(screen.queryByRole('button', { name: 'J’ai pris connaissance' })).not.toBeInTheDocument();
    });

    // F1 — the offer on leaving Scénario when the editor draft is ahead of the head version.
    describe('the handoff offer (unsaved scenario)', () => {
      const unsaved = makePage({ id: 'pg7', chapterId: 'c1', title: 'Page 7', stage: 'scenario', scenarioUnsaved: true });

      it('offers to create a version first instead of moving straight away', async () => {
        renderBoard([unsaved]);
        await moveToColumn('Nemu');
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Créer une version' })).toHaveAttribute(
          'href',
          '/projet/nuit-blanche/editeur/pg7',
        );
        expect(api.updatePageStage).not.toHaveBeenCalled();
      });

      it('« Passer sans créer de version » moves the card as before', async () => {
        (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...unsaved, stage: 'nemu' });
        renderBoard([unsaved]);
        await moveToColumn('Nemu');
        await userEvent.click(await screen.findByRole('button', { name: 'Passer sans version' }));
        await waitFor(() => expect(api.updatePageStage).toHaveBeenCalledWith('pg7', 'nemu'));
      });

      it('« Annuler » leaves the card where it was', async () => {
        renderBoard([unsaved]);
        await moveToColumn('Nemu');
        await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
        expect(api.updatePageStage).not.toHaveBeenCalled();
        expect(within(screen.getByRole('group', { name: /Scénario/i })).getByText('Page 7')).toBeInTheDocument();
      });

      it('a saved scenario moves with no prompt at all', async () => {
        const saved = makePage({ id: 'pg7', chapterId: 'c1', title: 'Page 7', stage: 'scenario' });
        (api.updatePageStage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...saved, stage: 'nemu' });
        renderBoard([saved]);
        await moveToColumn('Nemu');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        await waitFor(() => expect(api.updatePageStage).toHaveBeenCalledWith('pg7', 'nemu'));
      });
    });
  });
});
