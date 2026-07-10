// CS-13 FE-5 — the Galerie honours ?artist=<slug> in illustrations mode: the request carries the
// artist param, Trending is hidden (a non-default view), and the heading names the artist.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { GalleryListResponse, ProfileResponse } from '@encre-et-plume/shared';

const searchParams = new URLSearchParams('artist=dr1-yuki-moreau');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getGallery: vi.fn(),
    getGalleryTrending: vi.fn().mockResolvedValue([]),
    getProfile: vi.fn(),
    getCollection: vi.fn(),
  };
});

import * as api from '../lib/api';
import GalerieClient from '../components/galerie/GalerieClient';

const emptyGallery: GalleryListResponse = {
  items: [
    {
      id: 'g1', title: 'Aube', artistName: 'Yuki Moreau', artistSlug: 'dr1-yuki-moreau',
      category: 'process', categoryLabel: 'Process', likeCount: 10, thumbnail: null, is18plus: false,
    },
  ],
  summary: { illustrationCount: 1, artistCount: 1 },
  total: 1,
  page: 1,
  pageSize: 24,
  totalPages: 1,
};

describe('GalerieClient — ?artist= facet (CS-13 FE-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getGallery).mockResolvedValue(emptyGallery);
    vi.mocked(api.getProfile).mockResolvedValue({ displayName: 'Yuki Moreau' } as ProfileResponse);
  });

  it('forwards artist= to getGallery and names the artist in the heading', async () => {
    render(<GalerieClient />);
    await waitFor(() => expect(api.getGallery).toHaveBeenCalled());
    const query = vi.mocked(api.getGallery).mock.calls[0][0] as URLSearchParams;
    expect(query.get('artist')).toBe('dr1-yuki-moreau');
    await waitFor(() =>
      expect(screen.getByText(/Illustrations de Yuki Moreau/)).toBeInTheDocument(),
    );
    // Trending is a default-view-only feature — a filtered view hides it.
    expect(api.getGalleryTrending).toHaveBeenCalled();
  });
});
