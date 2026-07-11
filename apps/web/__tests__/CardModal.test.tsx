import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PageDetailResponse, WorkspaceMember, ProjectLabelItem } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getPageDetail: vi.fn(),
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
  { accountId: 'me', displayName: 'Yuki Moreau', avatar: null, role: 'scenariste' },
  { accountId: 'u2', displayName: 'Léo Dupont', avatar: null, role: 'dessinateur' },
];

const rouge: ProjectLabelItem = { id: 'lb1', name: 'Urgent', color: '#e8261c' };

function detail(over: Partial<PageDetailResponse> = {}): PageDetailResponse {
  return {
    id: 'pg7',
    chapterId: 'c1',
    title: 'Page 7',
    stage: 'scenario',
    version: 3,
    fileTags: [],
    linkedFileIds: [],
    dueDate: null,
    labels: [],
    assignees: [],
    checklistDone: 0,
    checklistTotal: 0,
    commentCount: 0,
    description: 'Un synopsis',
    checklist: [],
    comments: [],
    ...over,
  };
}

function mount(over: Partial<PageDetailResponse> = {}, props: Partial<React.ComponentProps<typeof CardModal>> = {}) {
  (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail(over));
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
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading skeleton then the detail sections', async () => {
    mount();
    expect(screen.getByRole('status', { name: /Chargement/ })).toBeInTheDocument();
    expect(await screen.findByLabelText('TITRE')).toHaveValue('Page 7');
    expect(screen.getByLabelText('Description')).toHaveValue('Un synopsis');
    expect(screen.getByText('COLONNE')).toBeInTheDocument();
    expect(screen.getByText('CHECKLIST')).toBeInTheDocument();
    expect(screen.getByText('COMMENTAIRES')).toBeInTheDocument();
  });

  it('debounce-autosaves the title with one PATCH and shows "Enregistré ✓"', async () => {
    (api.updatePage as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail(), title: 'Page 7!' });
    mount();
    const title = await screen.findByLabelText('TITRE');
    await userEvent.type(title, '!');
    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1));
    expect(api.updatePage).toHaveBeenCalledWith('pg7', { title: 'Page 7!' });
    expect(await screen.findByText('Enregistré ✓')).toBeInTheDocument();
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
});

function renderWith(over: Partial<PageDetailResponse>, props: Partial<React.ComponentProps<typeof CardModal>>) {
  (api.getPageDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail(over));
  return render(
    <CardModal pageId="pg7" slug="s" members={members} labels={[rouge]} viewerId="me" isOwner={false}
      onClose={() => {}} onPageChange={() => {}} onDeleted={() => {}} onLabelsChange={() => {}} {...props} />,
  );
}
