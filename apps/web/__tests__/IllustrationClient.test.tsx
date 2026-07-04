// DR-6 FE-T1 — route client: loading/404/error/ready states (mirrors OeuvreClient's pattern).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { IllustrationDetail, GalleryIllustrationCard } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getIllustration: vi.fn(),
    getIllustrationMore: vi.fn(),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('../lib/session', () => ({ useSession: () => ({ account: null, loading: false }) }));

import * as api from '../lib/api';
import IllustrationClient from '../components/illustration/IllustrationClient';

const detail: IllustrationDetail = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  description: 'Une description.',
  category: 'process',
  categoryLabel: 'Process',
  hashtags: ['encre'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
};

const more: GalleryIllustrationCard[] = [];

function mockReady() {
  vi.mocked(api.getIllustration).mockResolvedValue(detail);
  vi.mocked(api.getIllustrationMore).mockResolvedValue(more);
}

describe('IllustrationClient (DR-6 FE-T1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading placeholder then the ready page', async () => {
    mockReady();
    render(<IllustrationClient id="dr5-illus-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument());
  });

  it('shows a 404 view for an unknown id (FE-10)', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({ statusCode: 404, message: 'Illustration introuvable' });
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="nope" />);
    await waitFor(() => expect(screen.getByText('Illustration introuvable')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Galerie/i })).toHaveAttribute('href', '/galerie');
  });

  it('shows a generic error state on non-404 failure', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({ statusCode: 500, message: 'Erreur serveur' });
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
