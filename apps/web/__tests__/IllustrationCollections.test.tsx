// DR-12 V5 — illustration-detail collection chips + owner-only "Modifier". Chips link to the
// collection Œuvre; only the owner sees "Modifier"; saving diffs the multiselect and issues the
// matching add / remove membership calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, CollectionSummary, IllustrationDetail } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getMyCollections: vi.fn(),
    addCollectionIllustration: vi.fn().mockResolvedValue({}),
    removeCollectionIllustration: vi.fn().mockResolvedValue(undefined),
    updateIllustration: vi.fn().mockResolvedValue({ hashtags: ['encre'] }),
  };
});

import * as api from '../lib/api';
import IllustrationCollections from '../components/illustration/IllustrationCollections';

const owner: AccountSummary = {
  id: 'acc-yuki', displayName: 'Yuki', email: 'y@x.fr', role: 'utilisateur', verified: false, slug: 'yuki-moreau',
  avatar: null, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'system', dmPolicy: 'requests' }, emailVerified: true,
  needsCguReconsent: false, onboarded: true, isAdult: true,
};

const myCollections: CollectionSummary[] = [
  { id: 'c1', slug: 'carnet', title: 'Carnet', cover: null, count: 1 },
  { id: 'c2', slug: 'autre', title: 'Autre', cover: null, count: 0 },
];

function makeDetail(): IllustrationDetail {
  return {
    id: 'ill-1', title: 'Aube', description: null, category: 'personnages', categoryLabel: 'Personnages',
    genres: [], hashtags: [], image: null, dimensionsLabel: null, tools: null, license: null, likeCount: 0,
    publishedAt: '2026-01-01T00:00:00.000Z',
    artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
    is18plus: false,
    collections: [{ id: 'c1', slug: 'carnet', title: 'Carnet' }],
  };
}

describe('IllustrationCollections (DR-12 V5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getMyCollections as ReturnType<typeof vi.fn>).mockResolvedValue(myCollections);
  });

  it('shows collection chips linking to the Œuvre and no "Modifier" for a visitor', () => {
    render(<IllustrationCollections detail={makeDetail()} account={null} />);
    expect(screen.getByRole('link', { name: 'Carnet' })).toHaveAttribute('href', '/oeuvre/carnet');
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('owner can edit membership; save issues the matching add/remove calls', async () => {
    const user = userEvent.setup();
    render(<IllustrationCollections detail={makeDetail()} account={owner} />);

    await user.click(screen.getByRole('button', { name: 'Modifier' }));

    // Multiselect seeded with the current membership (c1).
    await user.click(await screen.findByRole('button', { name: /Ajouter à une collection/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Carnet' })); // remove c1
    await user.click(await screen.findByRole('checkbox', { name: 'Autre' })); // add c2
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.addCollectionIllustration).toHaveBeenCalledWith('c2', 'ill-1'));
    expect(api.removeCollectionIllustration).toHaveBeenCalledWith('c1', 'ill-1');
  });

  it('persists edited hashtags on save and reports them back (DR-12 iter2 FE-9)', async () => {
    const user = userEvent.setup();
    const onHashtagsChange = vi.fn();
    render(<IllustrationCollections detail={makeDetail()} account={owner} onHashtagsChange={onHashtagsChange} />);

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.type(await screen.findByLabelText('Hashtags'), '#Encre ');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(api.updateIllustration).toHaveBeenCalledWith('ill-1', { hashtags: ['encre'] }));
    expect(onHashtagsChange).toHaveBeenCalledWith(['encre']);
  });

  it('does NOT call updateIllustration when the hashtags are unchanged (FE-9)', async () => {
    const user = userEvent.setup();
    render(<IllustrationCollections detail={makeDetail()} account={owner} />);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.getMyCollections).toHaveBeenCalled());
    expect(api.updateIllustration).not.toHaveBeenCalled();
  });
});
