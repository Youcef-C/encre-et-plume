// DR-6 FE-T4 (FE-6, FE-7, FE-8, FE-11) — sidebar: artist card, Détails, more-by-artist.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IllustrationArtist, GalleryIllustrationCard } from '@encre-et-plume/shared';
import ArtistSidebar from '../components/illustration/ArtistSidebar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const linkedArtist: IllustrationArtist = {
  id: 'a1',
  name: 'Yuki Moreau',
  slug: 'dr1-yuki-moreau',
  role: 'Dessinateur·rice',
  city: 'Lyon',
  avatar: null,
};

const unlinkedArtist: IllustrationArtist = {
  id: null,
  name: 'Sasha N.',
  slug: null,
  role: 'Dessinateur·rice',
  city: null,
  avatar: null,
};

const more: GalleryIllustrationCard[] = [
  {
    id: 'dr5-illus-3',
    title: 'Étude d’encre #7',
    artistName: 'Yuki Moreau',
    artistSlug: 'dr1-yuki-moreau',
    category: 'process',
    categoryLabel: 'Process',
    likeCount: 1300,
    thumbnail: null,
  },
];

describe('ArtistSidebar (DR-6)', () => {
  beforeEach(() => push.mockClear());

  it('links the artist name when slug is present (FE-6)', () => {
    render(
      <ArtistSidebar
        artist={linkedArtist}
        categoryLabel="Process"
        publishedAt="2026-06-12T00:00:00.000Z"
        dimensionsLabel="2480 × 3508"
        tools="Encre · CSP"
        license="© Tous droits réservés"
        more={more}
        account={null}
      />,
    );
    expect(screen.getByRole('link', { name: 'Yuki Moreau' })).toHaveAttribute('href', '/dr1-yuki-moreau');
  });

  it('renders plain text (no link) when the artist has no slug', () => {
    render(
      <ArtistSidebar
        artist={unlinkedArtist}
        categoryLabel="Fan-art"
        publishedAt={null}
        dimensionsLabel={null}
        tools={null}
        license="© Tous droits réservés"
        more={[]}
        account={null}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Sasha N.' })).not.toBeInTheDocument();
    expect(screen.getByText('Sasha N.')).toBeInTheDocument();
  });

  it('renders Détails rows with "—" fallback for null tools/dimensions (FE-7)', () => {
    render(
      <ArtistSidebar
        artist={unlinkedArtist}
        categoryLabel="Fan-art"
        publishedAt={null}
        dimensionsLabel={null}
        tools={null}
        license="© Tous droits réservés"
        more={[]}
        account={null}
      />,
    );
    expect(screen.getByText('Fan-art')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2); // Publié + Dimensions + Outils
  });

  it('renders focusable more-by-artist cards, hidden when empty (FE-8, FE-11)', () => {
    render(
      <ArtistSidebar
        artist={linkedArtist}
        categoryLabel="Process"
        publishedAt="2026-06-12T00:00:00.000Z"
        dimensionsLabel="2480 × 3508"
        tools="Encre · CSP"
        license="© Tous droits réservés"
        more={more}
        account={null}
      />,
    );
    expect(screen.getByRole('link', { name: /Étude d.encre #7/ })).toHaveAttribute('href', '/illustration/dr5-illus-3');
  });

  it('hides the more-by-artist section entirely when empty', () => {
    render(
      <ArtistSidebar
        artist={linkedArtist}
        categoryLabel="Process"
        publishedAt="2026-06-12T00:00:00.000Z"
        dimensionsLabel="2480 × 3508"
        tools="Encre · CSP"
        license="© Tous droits réservés"
        more={[]}
        account={null}
      />,
    );
    expect(screen.queryByText('Plus de cet·te artiste')).not.toBeInTheDocument();
  });

  it('anonymous Suivre routes to sign-in (F-1)', async () => {
    const user = userEvent.setup();
    render(
      <ArtistSidebar
        artist={linkedArtist}
        categoryLabel="Process"
        publishedAt="2026-06-12T00:00:00.000Z"
        dimensionsLabel="2480 × 3508"
        tools="Encre · CSP"
        license="© Tous droits réservés"
        more={more}
        account={null}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Suivre/ }));
    expect(push).toHaveBeenCalledWith('/connexion');
  });
});
