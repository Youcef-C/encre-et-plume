import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PageDetailResponse, WorkspaceMember, ProjectLabelItem, AssetItem, AssetListResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getPageDetail: vi.fn(),
    listProjectAssets: vi.fn(),
    getAssetVersions: vi.fn(),
    getAssetPreview: vi.fn(),
    linkAssetToPage: vi.fn(),
    unlinkAssetFromPage: vi.fn(),
    updatePage: vi.fn(),
    updatePageStage: vi.fn(),
    deletePage: vi.fn(),
    createProjectLabel: vi.fn(),
    updateProjectLabel: vi.fn(),
    deleteProjectLabel: vi.fn(),
    addChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
    deleteChecklistItem: vi.fn(),
    addPageComment: vi.fn(),
    updatePageComment: vi.fn(),
    deletePageComment: vi.fn(),
  };
});

import * as api from '../lib/api';
import CardModal from '../components/projet/CardModal';

const members: WorkspaceMember[] = [
  { accountId: 'me', displayName: 'Yuki Moreau', avatar: null, roles: ['scenariste'] },
  { accountId: 'u2', displayName: 'Léo Dupont', avatar: null, roles: ['dessinateur'] },
];

const rouge: ProjectLabelItem = { id: 'lb1', name: 'Urgent', color: '#e8261c' };

function detail(over: Partial<PageDetailResponse> = {}): PageDetailResponse {
  return {
    id: 'pg7',
    chapterId: 'c1',
    title: 'Page 7',
    stage: 'scenario',
    fileTags: [],
    linkedFileIds: [],
    linkedFiles: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    createdById: null,
    description: 'Un synopsis',
    checklist: [],
    comments: [],
    ...over,
  };
}

function asset(over: Partial<AssetItem> = {}): AssetItem {
  return {
    id: 'a1',
    type: 'scenario',
    filename: 'scenario.txt',
    currentVersion: 3,
    size: 1024,
    thumbnailUrl: null,
    previewable: true,
    linkedPages: [{ id: 'pg7', title: 'Page 7' }],
    updatedAt: '2026-07-10T10:00:00.000Z',
    ...over,
  };
}

function assetList(items: AssetItem[]): AssetListResponse {
  return { items, total: items.length, page: 1, pageSize: 24, totalPages: 1 };
}

function mount(over: Partial<PageDetailResponse> = {}, props: Partial<React.ComponentProps<typeof CardModal>> = {}, assets: AssetItem[] = []) {
  (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail(over));
  (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList(assets));
  const onClose = vi.fn();
  const onPageChange = vi.fn();
  const onDeleted = vi.fn();
  const onLabelsChange = vi.fn();
  render(
    <CardModal
      pageId="pg7"
      slug="nuit-blanche"
      members={members}
      labels={[rouge]}
      viewerId="me"
      isOwner={false}
      onClose={onClose}
      onPageChange={onPageChange}
      onDeleted={onDeleted}
      onLabelsChange={onLabelsChange}
      {...props}
    />,
  );
  return { onClose, onPageChange, onDeleted, onLabelsChange };
}

describe('CardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no linked files (the FICHIERS block fetches on open in every render).
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList([]));
  });

  it('shows a loading skeleton then the detail sections', async () => {
    mount();
    expect(screen.getByRole('status', { name: /Chargement/ })).toBeInTheDocument();
    expect(await screen.findByLabelText('TITRE')).toHaveValue('Page 7');
    expect(screen.getByLabelText('Description')).toHaveValue('Un synopsis');
    expect(screen.getByText('COLONNE')).toBeInTheDocument();
    expect(screen.getByText('CHECKLIST')).toBeInTheDocument();
    expect(screen.getByText('COMMENTAIRES')).toBeInTheDocument();
  });

  // ── R2-5 · move a card between chapters (the way OUT of "Sans chapitre") ────
  describe('CHAPITRE field (R2-5)', () => {
    const chapters = [
      { id: 'c1', number: 0, title: 'L’orage', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 },
      { id: 'c2', number: 1, title: 'La rencontre', status: 'draft', plancheCount: 0, targetPages: 20, progressPct: 0 },
    ] as React.ComponentProps<typeof CardModal>['chapters'];

    it('lists this project chapters in an OnBrandSelect — no native select, no "no chapter" option', async () => {
      mount({}, { chapters });
      expect(await screen.findByText('CHAPITRE')).toBeInTheDocument();
      expect(document.querySelector('select')).toBeNull();

      const trigger = screen.getByRole('combobox', { name: 'Chapitre' });
      expect(trigger).toHaveTextContent('Prologue — L’orage');
      await userEvent.click(trigger);

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['Prologue — L’orage', 'Ch. 1 — La rencontre']);
    });

    it('PATCHes chapterId on select and bubbles the moved card up to the board', async () => {
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail(), chapterId: 'c2' });
      const { onPageChange } = mount({}, { chapters });

      await userEvent.click(await screen.findByRole('combobox', { name: 'Chapitre' }));
      await userEvent.click(screen.getByRole('option', { name: 'Ch. 1 — La rencontre' }));

      await waitFor(() => expect(api.updatePage).toHaveBeenCalledWith('pg7', { chapterId: 'c2' }));
      await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'c2' })));
    });

    it('is absent for a member without « Écriture »', async () => {
      mount({}, { chapters, readOnly: true });
      await screen.findByLabelText('TITRE');
      expect(screen.queryByText('CHAPITRE')).not.toBeInTheDocument();
    });
  });

  it('debounce-autosaves the title with one PATCH and shows "Enregistré"', async () => {
    (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail(), title: 'Page 7!' });
    mount();
    const title = await screen.findByLabelText('TITRE');
    await userEvent.type(title, '!');
    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1));
    expect(api.updatePage).toHaveBeenCalledWith('pg7', { title: 'Page 7!' });
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
  });

  it('creates a label with name + palette colour', async () => {
    const created = { id: 'lb2', name: 'Idée', color: '#3f5aa8' };
    (api.createProjectLabel as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const { onLabelsChange } = mount();
    await screen.findByLabelText('TITRE');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.type(screen.getByLabelText("Nom de l'étiquette"), 'Idée');
    await userEvent.click(screen.getByRole('button', { name: 'bleu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() =>
      expect(api.createProjectLabel).toHaveBeenCalledWith('nuit-blanche', { name: 'Idée', color: '#3f5aa8' }),
    );
    expect(onLabelsChange).toHaveBeenCalledWith([rouge, created]);
  });

  it('applies a label → debounced updatePage with labelIds', async () => {
    (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue(detail({ labels: [rouge] }));
    mount();
    await screen.findByLabelText('TITRE');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.click(screen.getByRole('button', { name: 'Urgent', pressed: false }));
    await waitFor(() => expect(api.updatePage).toHaveBeenCalledWith('pg7', { labelIds: ['lb1'] }));
  });

  it('toggles a checklist item optimistically and updates the (x/x) count', async () => {
    (api.updateChecklistItem as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ck1', text: 'Encrer', done: true, order: 0 });
    mount({ checklist: [{ id: 'ck1', text: 'Encrer', done: false, order: 0 }], checklistTotal: 1 });
    await screen.findByLabelText('TITRE');
    expect(screen.getByText('(0/1)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Encrer' }));
    expect(api.updateChecklistItem).toHaveBeenCalledWith('ck1', { done: true });
    expect(await screen.findByText('(1/1)')).toBeInTheDocument();
  });

  it('adds a checklist item', async () => {
    (api.addChecklistItem as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ck9', text: 'Corriger', done: false, order: 0 });
    mount();
    await screen.findByLabelText('TITRE');
    await userEvent.type(screen.getByLabelText('Nouvel élément'), 'Corriger');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(api.addChecklistItem).toHaveBeenCalledWith('pg7', { text: 'Corriger' });
    expect(await screen.findByText('Corriger')).toBeInTheDocument();
  });

  it('assigns a member immediately with the full assigneeIds set', async () => {
    (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue(detail());
    mount();
    await screen.findByLabelText('TITRE');
    await userEvent.click(screen.getByRole('button', { name: /Léo Dupont/, pressed: false }));
    expect(api.updatePage).toHaveBeenCalledWith('pg7', { assigneeIds: ['u2'] });
  });

  it('lets the author edit their own comment (shows "modifié") and delete it', async () => {
    (api.updatePageComment as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'cm1', authorId: 'me', authorName: 'Yuki Moreau', authorAvatar: null,
      body: 'Corrigé', createdAt: '2026-07-11T10:00:00.000Z', editedAt: '2026-07-11T11:00:00.000Z',
    });
    (api.deletePageComment as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mount({
      comments: [
        { id: 'cm1', authorId: 'me', authorName: 'Yuki Moreau', authorAvatar: null, body: 'Salut', createdAt: '2026-07-11T10:00:00.000Z', editedAt: null },
      ],
      commentCount: 1,
    });
    await screen.findByLabelText('TITRE');
    await userEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    const box = screen.getByLabelText('Modifier le commentaire');
    await userEvent.clear(box);
    await userEvent.type(box, 'Corrigé');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(api.updatePageComment).toHaveBeenCalledWith('cm1', { body: 'Corrigé' });
    expect(await screen.findByText('modifié')).toBeInTheDocument();
  });

  it('hides Modifier/Supprimer on others comments unless the viewer is the project owner', async () => {
    const others = {
      comments: [
        { id: 'cm2', authorId: 'u2', authorName: 'Léo Dupont', authorAvatar: null, body: 'Hello', createdAt: '2026-07-11T10:00:00.000Z', editedAt: null },
      ],
      commentCount: 1,
    };
    const { unmount } = renderWith(others, { isOwner: false });
    await screen.findByLabelText('TITRE');
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    unmount();

    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail(others));
    render(
      <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId="me" isOwner
        onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    await screen.findByLabelText('TITRE');
    // Owner can delete any comment (but still can't edit someone else's).
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('@name autocomplete inserts @DisplayName into the composer', async () => {
    mount();
    await screen.findByLabelText('TITRE');
    const composer = screen.getByLabelText('Écrire un commentaire');
    await userEvent.type(composer, 'Coucou @Léo');
    await userEvent.click(await screen.findByRole('option', { name: /Léo Dupont/ }));
    expect(composer).toHaveValue('Coucou @Léo Dupont ');
  });

  it('closes on ✕, backdrop and Escape', async () => {
    const { onClose } = mount();
    await screen.findByLabelText('TITRE');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // ── R7-2 · closing inside the 600 ms autosave debounce must not drop the edit ──
  // Each assertion is SYNCHRONOUS right after the close gesture: waiting would let the pending
  // debounce fire on its own and hide the bug the fix exists for.
  describe('pending autosave on close (R7-2)', () => {
    async function editTitle() {
      (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail(), title: 'Page 7!' });
      const handles = mount({}, { canDelete: true });
      await userEvent.type(await screen.findByLabelText('TITRE'), '!');
      return handles;
    }

    it('flushes the pending edit before closing on Escape', async () => {
      const { onClose } = await editTitle();
      await userEvent.keyboard('{Escape}');
      expect(api.updatePage).toHaveBeenCalledWith('pg7', { title: 'Page 7!' });
      expect(onClose).toHaveBeenCalled();
    });

    it('flushes the pending edit before closing on the ✕ button', async () => {
      const { onClose } = await editTitle();
      await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
      expect(api.updatePage).toHaveBeenCalledWith('pg7', { title: 'Page 7!' });
      expect(onClose).toHaveBeenCalled();
    });

    it('flushes the pending edit before closing on the backdrop', async () => {
      const { onClose } = await editTitle();
      await userEvent.click(screen.getByRole('dialog').parentElement!);
      expect(api.updatePage).toHaveBeenCalledWith('pg7', { title: 'Page 7!' });
      expect(onClose).toHaveBeenCalled();
    });

    it('does not save on the delete path — the card is being destroyed', async () => {
      (api.deletePage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const { onDeleted } = await editTitle();
      await userEvent.click(screen.getByRole('button', { name: 'Supprimer la carte' }));
      await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('pg7'));
      // Past the 600 ms debounce: the pending timer must have been dropped, not flushed.
      await new Promise((r) => setTimeout(r, 700));
      expect(api.updatePage).not.toHaveBeenCalled();
    });

    it('does not save twice when the debounce already fired before the close', async () => {
      const { onClose } = await editTitle();
      await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1));
      await userEvent.keyboard('{Escape}');
      expect(api.updatePage).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });

  // CS-5 F5 — when the card is in Corrections, deep-link to the review screen (mirrors KanbanBoard's ⚑).
  it('shows the "Voir les corrections →" link on a Corrections card, pointing at the revision route', async () => {
    mount({ stage: 'corrections' });
    await screen.findByLabelText('TITRE');
    expect(screen.getByRole('link', { name: 'Voir les corrections →' })).toHaveAttribute(
      'href',
      '/projet/nuit-blanche/revision/pg7',
    );
  });

  it('hides the "Voir les corrections →" link when the card is not in Corrections', async () => {
    mount({ stage: 'scenario' });
    await screen.findByLabelText('TITRE');
    expect(screen.queryByRole('link', { name: 'Voir les corrections →' })).not.toBeInTheDocument();
  });

  it('read-only viewers get no composer, no add controls and no Supprimer', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail());
    render(
      <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId={null} isOwner={false}
        readOnly onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    await screen.findByLabelText('TITRE');
    expect(screen.queryByLabelText('Écrire un commentaire')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la carte' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('TITRE')).toHaveAttribute('readonly');
  });

  // ── FICHIERS (par type) — CS-2 post-CS-3 ──────────────────────────────────────

  it('renders the four FICHIERS sections and groups linked files by type', async () => {
    mount({}, {}, [
      asset({ id: 'a1', type: 'texte', filename: 'dialogue.txt', currentVersion: 1 }),
      asset({ id: 'a2', type: 'page', filename: 'planche.png', currentVersion: 4 }),
    ]);
    await screen.findByLabelText('TITRE');
    // Four section headings (label carries the story parentheticals).
    expect(await screen.findByText('SCÉNARIO')).toBeInTheDocument();
    expect(screen.getByText('DESSIN')).toBeInTheDocument();
    expect(screen.getByText('PAGE')).toBeInTheDocument();
    expect(screen.getByText('RÉFÉRENCES')).toBeInTheDocument();
    // texte → Scénario section; page → Page section, with per-file versions.
    expect(await screen.findByText('dialogue.txt')).toBeInTheDocument();
    expect(screen.getByText('planche.png')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v4')).toBeInTheDocument();
  });

  it('shows a total file-count label in the section header', async () => {
    mount({}, {}, [
      asset({ id: 'a1', type: 'scenario', filename: 's.txt' }),
      asset({ id: 'a2', type: 'page', filename: 'p.png' }),
    ]);
    await screen.findByLabelText('TITRE');
    expect(await screen.findByText('2 fichiers')).toBeInTheDocument();
  });

  it('shows "Aucun fichier" in the header when nothing is linked', async () => {
    mount();
    await screen.findByLabelText('TITRE');
    expect(await screen.findByText('Aucun fichier')).toBeInTheDocument();
  });

  it('shows filled count pills on filled sections, "Vide" + empty state elsewhere', async () => {
    mount({}, {}, [
      asset({ id: 'a1', type: 'scenario', filename: 's.txt' }),
      asset({ id: 'a2', type: 'page', filename: 'p.png' }),
    ]);
    await screen.findByText('s.txt');
    expect(screen.getByText('2 fichiers')).toBeInTheDocument(); // header total
    expect(screen.getAllByText('1 fichier')).toHaveLength(2); // scenario + page pills
    expect(screen.getAllByText('Vide')).toHaveLength(2); // dessin + références
    expect(screen.getAllByText('Aucun fichier lié')).toHaveLength(2);
  });

  it('collapses and expands a filled section', async () => {
    mount({}, {}, [asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })]);
    await screen.findByText('scenario.txt');
    const toggle = screen.getByRole('button', { name: 'Masquer les fichiers — SCÉNARIO' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(screen.queryByText('scenario.txt')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afficher les fichiers — SCÉNARIO' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the Aperçu overlay for a linked file', async () => {
    (api.getAssetPreview as ReturnType<typeof vi.fn>).mockResolvedValue({
      mode: 'image', url: 'blob:x', downloadUrl: 'd', filename: 'scenario.txt', version: 3,
    });
    mount({}, {}, [asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })]);
    await screen.findByText('scenario.txt');
    await userEvent.click(screen.getByRole('button', { name: /Aperçu de scenario.txt/ }));
    expect(await screen.findByRole('button', { name: /Fermer l’aperçu/ })).toBeInTheDocument();
    expect(api.getAssetPreview).toHaveBeenCalledWith('a1');
  });

  it('opens the per-file version history (AssetVersionsModal)', async () => {
    (api.getAssetVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { version: 3, mediaId: 'm3', size: 10, note: 'Révision', authorId: 'u1', authorName: 'Yuki', createdAt: '2026-07-10', thumbnailUrl: null },
    ]);
    mount({}, {}, [asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })]);
    await screen.findByText('scenario.txt');
    await userEvent.click(screen.getByRole('button', { name: /Historique des versions de scenario.txt/ }));
    expect(await screen.findByRole('dialog', { name: 'Versions' })).toBeInTheDocument();
    expect(api.getAssetVersions).toHaveBeenCalledWith('a1');
  });

  it('shows a "＋ Lier" affordance next to each section label and opens the picker', async () => {
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(assetList([]));
    mount();
    await screen.findByLabelText('TITRE');
    const linkButtons = await screen.findAllByRole('button', { name: /^Lier un fichier \(/ });
    expect(linkButtons.length).toBe(4); // one per section (Scénario / Dessin / Page / Références)
    expect(screen.getByRole('button', { name: 'Lier un fichier (PAGE)' })).toBeInTheDocument();
    // F8: the compact affordance is labelled "＋ Lier" (verbatim visible text).
    expect(linkButtons[0]).toHaveTextContent('＋ Lier');
    await userEvent.click(linkButtons[0]);
    // First section is SCÉNARIO — a shared (multi-card) type → the picker ADDS ("Lier · ajouter").
    const picker = await screen.findByRole('dialog', { name: 'Lier · ajouter' });
    // The import link lives inside the picker modal, pointing at the Fichiers tab.
    expect(within(picker).getByRole('link', { name: /Importer depuis Fichiers/ })).toHaveAttribute(
      'href',
      '/projet/nuit-blanche?tab=fichiers',
    );
  });

  // ── F7 · Retirer (unlink) ─────────────────────────────────────────────────────
  it('Retirer unlinks a file, removes the row and bubbles the page without it', async () => {
    (api.unlinkAssetFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', linkedPages: [] }),
    );
    const { onPageChange } = mount({}, {}, [
      asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 }),
    ]);
    await screen.findByText('scenario.txt');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer scenario.txt de la carte' }));
    expect(api.unlinkAssetFromPage).toHaveBeenCalledWith('a1', 'pg7');
    await waitFor(() => expect(screen.queryByText('scenario.txt')).not.toBeInTheDocument());
    // The last page bubble drops the file from linkedFiles/linkedFileIds.
    const last = (onPageChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last.linkedFiles).toEqual([]);
    expect(last.linkedFileIds).toEqual([]);
  });

  // ML-5-BUG (QA Finding 1): the optimistic unlink patch must prune the card's fileTags the same way
  // the server does, so no stray bare file-type tag reappears until reload.
  it('ML-5-BUG: Retirer prunes the covered fileTag when no linked asset of that type remains', async () => {
    (api.unlinkAssetFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', linkedPages: [] }),
    );
    const { onPageChange } = mount(
      { fileTags: ['scenario'], linkedFileIds: ['a1'] },
      {},
      [asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })],
    );
    await screen.findByText('scenario.txt');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer scenario.txt de la carte' }));
    const last = (onPageChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last.linkedFiles).toEqual([]);
    expect(last.fileTags).toEqual([]); // 'scenario' pruned — no covering asset left on the card
  });

  it('ML-5-BUG: Retirer keeps a fileTag still covered by another linked asset of that type', async () => {
    (api.unlinkAssetFromPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', linkedPages: [] }),
    );
    const { onPageChange } = mount(
      { fileTags: ['scenario'], linkedFileIds: ['a1', 'a2'] },
      {},
      [
        asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 }),
        asset({ id: 'a2', type: 'texte', filename: 'notes.txt', currentVersion: 1 }),
      ],
    );
    await screen.findByText('scenario.txt');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer scenario.txt de la carte' }));
    const last = (onPageChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    // 'texte' still covers the 'scenario' tag → tag stays.
    expect(last.fileTags).toEqual(['scenario']);
  });

  it('read-only viewers get no Retirer', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail());
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      assetList([asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })]),
    );
    render(
      <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId={null} isOwner={false}
        readOnly onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    await screen.findByText('scenario.txt');
    expect(screen.queryByRole('button', { name: /Retirer scenario.txt/ })).not.toBeInTheDocument();
  });

  it('read-only viewers get Aperçu + history but no link affordance', async () => {
    (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail());
    (api.listProjectAssets as ReturnType<typeof vi.fn>).mockResolvedValue(
      assetList([asset({ id: 'a1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 })]),
    );
    render(
      <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId={null} isOwner={false}
        readOnly onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} />,
    );
    await screen.findByText('scenario.txt');
    expect(screen.getByRole('button', { name: /Aperçu de scenario.txt/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Historique des versions de scenario.txt/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '＋ Lier un fichier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lier · remplacer' })).not.toBeInTheDocument();
  });
  // CS-10 D-1 — the modal's destructive footer mirrors `PagesService.deletePage` (leadership OR the
  // card's author). Defence in depth: never the only gate, but never offered when it would 403.
  it('hides « Supprimer la carte » from a viewer who may not delete it', async () => {
    mount();
    await screen.findByLabelText('TITRE');
    expect(screen.queryByRole('button', { name: 'Supprimer la carte' })).not.toBeInTheDocument();
  });

  it('offers « Supprimer la carte » to a viewer who may (leadership or the card author)', async () => {
    mount({}, { canDelete: true });
    await screen.findByLabelText('TITRE');
    expect(screen.getByRole('button', { name: 'Supprimer la carte' })).toBeInTheDocument();
  });
});

function renderWith(over: Partial<PageDetailResponse>, props: Partial<React.ComponentProps<typeof CardModal>>) {
  (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail(over));
  return render(
    <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId="me" isOwner={false}
      onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} {...props} />,
  );
}
