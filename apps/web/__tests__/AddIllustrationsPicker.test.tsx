// DR-12 iter2 (FE-11 · V10) — multi-select "＋ Ajouter des illustrations" picker: lists only the
// addable (non-member) own illustrations, the "Ajouter (n)" count tracks the selection, confirm
// fires one POST per selected id and commits the LAST returned detail; empty state; Esc closes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CollectionDetail, GalleryIllustrationCard } from '@encre-et-plume/shared';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, addCollectionIllustration: vi.fn() };
});

import * as api from '../lib/api';
import AddIllustrationsPicker from '../components/collections/AddIllustrationsPicker';

const addable: GalleryIllustrationCard[] = [
  { id: 'ill-11', title: 'Onibi', artistName: 'Yuki', artistSlug: null, likeCount: 0, thumbnail: null, category: 'personnages', categoryLabel: 'Personnages', is18plus: false },
  { id: 'ill-12', title: 'Kitsune', artistName: 'Yuki', artistSlug: null, likeCount: 0, thumbnail: null, category: 'decors', categoryLabel: 'Décors', is18plus: false },
];

function makeDetail(count: number): CollectionDetail {
  return {
    id: 'w1', slug: 'carnet', title: "Carnet d'Encre", cover: null, count,
    description: null, genres: [], hashtags: [], items: [],
    owner: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau' },
    contestId: null, soutien: null, fundingGoals: [],
  };
}

describe('AddIllustrationsPicker (DR-12 iter2 FE-11)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the addable illustrations and tracks the "Ajouter (n)" count', async () => {
    const user = userEvent.setup();
    render(<AddIllustrationsPicker collectionId="w1" illustrations={addable} onClose={() => {}} onCommitted={() => {}} />);

    expect(screen.getByText('Onibi')).toBeInTheDocument();
    expect(screen.getByText('Kitsune')).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /Ajouter \(0\)/ });
    expect(addBtn).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Onibi/ }));
    expect(screen.getByRole('button', { name: /Ajouter \(1\)/ })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: /Kitsune/ }));
    expect(screen.getByRole('button', { name: /Ajouter \(2\)/ })).toBeInTheDocument();
  });

  it('posts one membership per selected id and commits the last returned detail, then closes', async () => {
    const user = userEvent.setup();
    const onCommitted = vi.fn();
    const onClose = vi.fn();
    (api.addCollectionIllustration as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeDetail(1))
      .mockResolvedValueOnce(makeDetail(2));

    render(<AddIllustrationsPicker collectionId="w1" illustrations={addable} onClose={onClose} onCommitted={onCommitted} />);

    await user.click(screen.getByRole('checkbox', { name: /Onibi/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kitsune/ }));
    await user.click(screen.getByRole('button', { name: /Ajouter \(2\)/ }));

    await waitFor(() => expect(api.addCollectionIllustration).toHaveBeenCalledTimes(2));
    expect(api.addCollectionIllustration).toHaveBeenCalledWith('w1', 'ill-11');
    expect(api.addCollectionIllustration).toHaveBeenCalledWith('w1', 'ill-12');
    expect(onCommitted).toHaveBeenCalledWith(makeDetail(2)); // last response
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the empty state when nothing is addable, and still offers to publish a new one', () => {
    render(<AddIllustrationsPicker collectionId="w1" illustrations={[]} onClose={() => {}} onCommitted={() => {}} />);
    expect(screen.getByText('Aucune autre illustration à ajouter.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ Publier une nouvelle illustration' })).toBeInTheDocument();
  });

  it('routes to the publish flow with this collection preselected (create-and-add)', async () => {
    const user = userEvent.setup();
    render(<AddIllustrationsPicker collectionId="w1" illustrations={addable} onClose={() => {}} onCommitted={() => {}} />);
    await user.click(screen.getByRole('button', { name: '＋ Publier une nouvelle illustration' }));
    expect(push).toHaveBeenCalledWith('/creer/illustration?collection=w1');
  });

  it('Esc closes the picker', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddIllustrationsPicker collectionId="w1" illustrations={addable} onClose={onClose} onCommitted={() => {}} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
