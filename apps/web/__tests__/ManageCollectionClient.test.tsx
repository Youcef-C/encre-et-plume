// DR-12 V4 — ManageCollectionClient. Reorder (↑/↓) sends the full permuted id list, announces via
// aria-live and disables rows while pending; "Retirer" removes a membership; "Utiliser comme
// couverture" promotes a member illustration to cover; deleting runs a confirm step.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CollectionDetail } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../components/UploadControl', () => ({
  default: ({ label, frameHeight, hideLabel }: { label: string; frameHeight?: number; hideLabel?: boolean }) => (
    <div data-testid="upload-control" data-frame-height={frameHeight} data-hide-label={hideLabel ? 'true' : 'false'}>
      {label}
    </div>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getCollection: vi.fn(),
    getMyIllustrations: vi.fn().mockResolvedValue([]),
    getActiveContest: vi.fn().mockResolvedValue(null),
    getIllustration: vi.fn(),
    reorderCollection: vi.fn(),
    removeCollectionIllustration: vi.fn().mockResolvedValue(undefined),
    addCollectionIllustration: vi.fn(),
    updateCollection: vi.fn(),
    updateIllustration: vi.fn(),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
  };
});

import * as api from '../lib/api';
import ManageCollectionClient from '../components/collections/ManageCollectionClient';

const owner: AccountSummary = {
  id: 'acc-yuki', displayName: 'Yuki', email: 'y@x.fr', role: 'utilisateur', verified: false, slug: 'yuki-moreau',
  avatar: null, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'system', dmPolicy: 'requests' }, emailVerified: true,
  needsCguReconsent: false, onboarded: true, isAdult: true,
};

function makeDetail(overrides: Partial<CollectionDetail> = {}): CollectionDetail {
  return {
    id: 'w1', slug: 'carnet', title: "Carnet d'Encre", cover: null, count: 2,
    description: null, genres: [], hashtags: [],
    items: [
      { id: 'ill-1', title: 'Aube', thumbnail: null, likeCount: 3, category: 'personnages', categoryLabel: 'Personnages', order: 0, is18plus: false },
      { id: 'ill-2', title: 'Crépuscule', thumbnail: null, likeCount: 5, category: 'decors', categoryLabel: 'Décors', order: 1, is18plus: false },
    ],
    owner: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau' },
    contestId: null, soutien: null, fundingGoals: [],
    ...overrides,
  };
}

function renderManage() {
  return render(
    <SessionContext.Provider value={{ account: owner, loading: false, refresh: async () => {}, logout: async () => {} }}>
      <ManageCollectionClient id="w1" />
    </SessionContext.Provider>,
  );
}

describe('ManageCollectionClient (DR-12 V4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getCollection as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail());
    (api.getMyIllustrations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (api.getActiveContest as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('reorders via ↑, posts the full permutation, announces, and disables rows while pending', async () => {
    const user = userEvent.setup();
    let resolveReorder!: (v: CollectionDetail) => void;
    (api.reorderCollection as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise<CollectionDetail>((res) => { resolveReorder = res; }),
    );
    renderManage();

    const up = await screen.findByRole('button', { name: 'Monter Crépuscule' });
    await user.click(up);

    expect(api.reorderCollection).toHaveBeenCalledWith('w1', ['ill-2', 'ill-1']);
    // Rows disabled while the reorder is in flight.
    expect(up).toBeDisabled();

    resolveReorder(makeDetail({ items: [
      { id: 'ill-2', title: 'Crépuscule', thumbnail: null, likeCount: 5, category: 'decors', categoryLabel: 'Décors', order: 0, is18plus: false },
      { id: 'ill-1', title: 'Aube', thumbnail: null, likeCount: 3, category: 'personnages', categoryLabel: 'Personnages', order: 1, is18plus: false },
    ] }));

    expect(await screen.findByText('Ordre mis à jour')).toBeInTheDocument();
  });

  it('removes a member via "Retirer"', async () => {
    (api.getCollection as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeDetail())
      .mockResolvedValueOnce(makeDetail({ items: [makeDetail().items[1]], count: 1 }));
    const user = userEvent.setup();
    renderManage();
    await user.click(await screen.findByRole('button', { name: 'Retirer Aube' }));
    expect(api.removeCollectionIllustration).toHaveBeenCalledWith('w1', 'ill-1');
  });

  it('promotes a member to cover via "Utiliser comme couverture"', async () => {
    (api.updateCollection as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail({ cover: 'http://img/aube.jpg' }));
    const user = userEvent.setup();
    renderManage();
    const buttons = await screen.findAllByRole('button', { name: 'Utiliser comme couverture' });
    await user.click(buttons[0]);
    expect(api.updateCollection).toHaveBeenCalledWith('w1', { cover: { illustrationId: 'ill-1' } });
  });

  it('seeds hashtags from the detail and PATCHes them on "Enregistrer" (DR-12 iter2 FE-9)', async () => {
    (api.getCollection as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail({ hashtags: ['encre'] }));
    (api.updateCollection as ReturnType<typeof vi.fn>).mockResolvedValue(makeDetail({ hashtags: ['encre', 'noir'] }));
    const user = userEvent.setup();
    renderManage();

    // Seeded chip is present, then add another.
    expect(await screen.findByText('#encre')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Hashtags'), 'noir ');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.updateCollection).toHaveBeenCalled());
    const body = (api.updateCollection as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.hashtags).toEqual(['encre', 'noir']);
  });

  it('renders the persistent cover box as one frame with the label hidden, no separate preview box (DR-12 iter3 FE-15/D23)', async () => {
    renderManage();
    const upload = await screen.findByTestId('upload-control');
    // The upload label is sr-only (top-alignment) and the box carries the cover frame height;
    // FE-15/D23 removes the old separate preview-cover box — UploadControl's own side preview replaces it.
    expect(upload).toHaveAttribute('data-frame-height', '165');
    expect(upload).toHaveAttribute('data-hide-label', 'true');
    expect(screen.queryByTestId('cover-preview')).not.toBeInTheDocument();
  });

  it('per-member "Modifier" opens the shared edit form and updates the row title in place (DR-12 iter3 FE-14)', async () => {
    const fullIllus = {
      id: 'ill-1', title: 'Aube', description: null, category: 'personnages', categoryLabel: 'Personnages',
      genres: [], hashtags: [], image: null, dimensionsLabel: null, tools: null, license: null, likeCount: 3,
      publishedAt: '2026-01-01T00:00:00.000Z',
      artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
      is18plus: false, collections: [],
    };
    (api.getIllustration as ReturnType<typeof vi.fn>).mockResolvedValue(fullIllus);
    (api.updateIllustration as ReturnType<typeof vi.fn>).mockResolvedValue({ ...fullIllus, title: 'Aube v2' });
    const user = userEvent.setup();
    renderManage();

    await user.click(await screen.findByRole('button', { name: 'Modifier Aube' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(api.getIllustration).toHaveBeenCalledWith('ill-1'));

    const titleInput = within(dialog).getByLabelText('Titre');
    await user.clear(titleInput);
    await user.type(titleInput, 'Aube v2');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.updateIllustration).toHaveBeenCalledWith('ill-1', expect.objectContaining({ title: 'Aube v2' })));
    // The member row reflects the new title without a full collection re-fetch.
    await waitFor(() => expect(screen.getByText('Aube v2')).toBeInTheDocument());
  });

  it('opens the "＋ Ajouter des illustrations" picker (inline add rows removed, DR-12 iter2 FE-11)', async () => {
    (api.getMyIllustrations as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ill-11', title: 'Onibi', artistName: 'Yuki', artistSlug: null, likeCount: 0, thumbnail: null, category: 'personnages', categoryLabel: 'Personnages', is18plus: false },
    ]);
    const user = userEvent.setup();
    renderManage();
    await user.click(await screen.findByRole('button', { name: '＋ Ajouter des illustrations' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Onibi')).toBeInTheDocument();
  });

  it('deletes the collection through a confirm step', async () => {
    const user = userEvent.setup();
    renderManage();
    await user.click(await screen.findByRole('button', { name: 'Supprimer la collection' }));
    // Confirm copy reassures the illustrations survive.
    expect(screen.getByText('Les illustrations ne seront pas supprimées.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
    await waitFor(() => expect(api.deleteCollection).toHaveBeenCalledWith('w1'));
    expect(push).toHaveBeenCalledWith('/yuki-moreau');
  });
});
