// DR-12 V6 — profile "Œuvres publiées" grouping. A "Collections" section of cards → the collection
// Œuvre and an "Illustrations" section of standalone cards → the illustration; empty copy when the
// creator has published nothing; all cards are focusable links.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ProfileCollectionsResponse } from '@encre-et-plume/shared';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getProfileCollections: vi.fn() };
});

import * as api from '../lib/api';
import ProfileWorks from '../components/ProfileWorks';

const full: ProfileCollectionsResponse = {
  collections: [{ id: 'w1', slug: 'carnet', title: "Carnet d'Encre", cover: null, count: 3 }],
  illustrations: [
    { id: 'ill-9', title: 'Aube', artistName: 'Yuki', artistSlug: 'yuki-moreau', category: 'personnages', categoryLabel: 'Personnages', likeCount: 4, thumbnail: null, is18plus: false },
  ],
};

describe('ProfileWorks (DR-12 V6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders grouped collection cards and standalone illustration cards', async () => {
    (api.getProfileCollections as ReturnType<typeof vi.fn>).mockResolvedValue(full);
    render(<ProfileWorks slug="yuki-moreau" />);

    const collectionCard = await screen.findByRole('link', { name: /Carnet d'Encre/ });
    expect(collectionCard).toHaveAttribute('href', '/oeuvre/carnet');
    expect(screen.getByText('3 illustrations · collection')).toBeInTheDocument();

    const illCard = screen.getByRole('link', { name: /Aube/ });
    expect(illCard).toHaveAttribute('href', '/illustration/ill-9');
  });

  it('shows the empty copy when nothing is published', async () => {
    (api.getProfileCollections as ReturnType<typeof vi.fn>).mockResolvedValue({ collections: [], illustrations: [] });
    render(<ProfileWorks slug="yuki-moreau" />);
    expect(await screen.findByText("Aucune œuvre publiée pour l'instant.")).toBeInTheDocument();
  });

  // DR-14: only a terminal failure shows the block; a `{message}` with no statusCode is transport.
  it('shows a retry affordance when the fetch fails terminally', async () => {
    (api.getProfileCollections as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 403, message: 'Interdit', error: 'FORBIDDEN' });
    render(<ProfileWorks slug="yuki-moreau" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument());
  });

  // DR-14 F17 — a transport TypeError must never leak "Failed to fetch" into the role="alert";
  // it is transient, so the skeleton stays and the loop retries instead.
  it('keeps the skeleton on a transport failure and never renders the browser message', async () => {
    (api.getProfileCollections as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProfileWorks slug="yuki-moreau" />);
    await waitFor(() => expect(api.getProfileCollections).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chargement des œuvres…')).toBeInTheDocument();
  });
});
