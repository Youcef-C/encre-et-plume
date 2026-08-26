// DR-6 FE-T1 — route client: loading/404/error/ready states (mirrors OeuvreClient's pattern).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountSummary, IllustrationDetail, GalleryIllustrationCard } from '@encre-et-plume/shared';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getIllustration: vi.fn(),
    getIllustrationMore: vi.fn(),
    updateIllustration: vi.fn(),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
// Mutable session account so owner-only affordances (FE-13) can be exercised.
let sessionAccount: AccountSummary | null = null;
vi.mock('../lib/session', () => ({ useSession: () => ({ account: sessionAccount, loading: false }) }));

import * as api from '../lib/api';
import IllustrationClient from '../components/illustration/IllustrationClient';

const detail: IllustrationDetail = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  description: 'Une description.',
  category: 'process',
  categoryLabel: 'Process',
  genres: [],
  hashtags: ['encre'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
  is18plus: false,
  collections: [],
};

const more: GalleryIllustrationCard[] = [];

function mockReady() {
  vi.mocked(api.getIllustration).mockResolvedValue(detail);
  vi.mocked(api.getIllustrationMore).mockResolvedValue(more);
}

describe('IllustrationClient (DR-6 FE-T1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAccount = null;
  });

  it('shows a loading placeholder then the ready page', async () => {
    mockReady();
    render(<IllustrationClient id="dr5-illus-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument());
  });

  // F-24 FE-6: the server wrapper seeds the first render; the prop is additive (every other test
  // here renders without it).
  it('renders the illustration immediately from initialIllustration, with no placeholder', () => {
    mockReady();
    render(<IllustrationClient id="dr5-illus-1" initialIllustration={detail} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a 404 view for an unknown id (FE-10)', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({ statusCode: 404, message: 'Illustration introuvable' });
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="nope" />);
    await waitFor(() => expect(screen.getByText('Illustration introuvable')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Galerie/i })).toHaveAttribute('href', '/galerie');
  });

  // DR-14: a 500 is transient now — only a terminal, non-404 4xx reaches the generic error state.
  it('shows a generic error state on a terminal non-404 failure', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({ statusCode: 403, message: 'Accès refusé', error: 'FORBIDDEN' });
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  // DR-14 F1/F17 — a transport failure keeps the skeleton, retries, and never leaks the browser's
  // English "Failed to fetch" into a role="alert".
  it('keeps the skeleton on a transport failure and never renders the browser message', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue(new TypeError('Failed to fetch'));
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="dr5-illus-1" />);

    await waitFor(() => expect(api.getIllustration).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Chargement de l'illustration…")).toBeInTheDocument();
  });

  // ── DR-10: 18+ age gate ───────────────────────────────────────────────────────

  it('shows the AgeGate interstitial over an 18+ illustration when the viewer is not cleared', async () => {
    sessionStorage.clear();
    vi.mocked(api.getIllustration).mockResolvedValue({ ...detail, is18plus: true });
    vi.mocked(api.getIllustrationMore).mockResolvedValue(more);
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeInTheDocument());
  });

  // Presentation update (user-specified 2026-07-05): the interstitial now shows the page BLURRED
  // behind it instead of a flat backdrop, so the real content is present in the DOM again (it just
  // isn't reachable/announced) — superseding the earlier "content never mounts" regression test.
  it('renders the illustration content behind the gate, blurred + aria-hidden + non-interactive (not absent)', async () => {
    sessionStorage.clear();
    vi.mocked(api.getIllustration).mockResolvedValue({ ...detail, is18plus: true });
    vi.mocked(api.getIllustrationMore).mockResolvedValue(more);
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('dialog', { name: /contenu réservé aux adultes/i })).toBeInTheDocument());

    const heading = screen.getByText('Pluie de Néons', { selector: 'h1' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(detail.description!)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Pluie de Néons' })).not.toBeInTheDocument();
    const wrapper = heading.closest('[aria-hidden="true"]') as HTMLElement | null;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper!.style.filter).toContain('blur');
    expect(wrapper!.style.pointerEvents).toBe('none');
  });

  it('does not show the AgeGate for a non-18+ illustration', async () => {
    mockReady();
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a refusal (no retry) on a 403 AGE_RESTRICTED response', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({
      statusCode: 403,
      message: 'Ce contenu est réservé aux adultes.',
      error: 'AGE_RESTRICTED',
    });
    vi.mocked(api.getIllustrationMore).mockResolvedValue([]);
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByText('Ce contenu est réservé aux adultes.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  // ── FE-13: owner edit of the illustration itself ─────────────────────────────
  const ownerAccount: AccountSummary = {
    id: 'a1', displayName: 'Yuki', email: 'y@x.fr', role: 'utilisateur', verified: false, slug: 'dr1-yuki-moreau',
    avatar: null, createdAt: '2026-01-01T00:00:00.000Z', preferences: { theme: 'system', dmPolicy: 'requests' }, emailVerified: true,
    needsCguReconsent: false, onboarded: true, isAdult: true,
  };

  it('shows no owner "Modifier" for a visitor', async () => {
    mockReady();
    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: "Modifier l'illustration" })).not.toBeInTheDocument();
  });

  it('owner opens the edit form and the page re-renders from the save response (FE-13)', async () => {
    sessionAccount = ownerAccount;
    mockReady();
    const { updateIllustration } = await import('../lib/api');
    vi.mocked(updateIllustration).mockResolvedValue({ ...detail, title: 'Aube Nouvelle', hashtags: ['nuit'] });
    const user = (await import('@testing-library/user-event')).default.setup();

    render(<IllustrationClient id="dr5-illus-1" />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: "Modifier l'illustration" }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Titre'));
    await user.type(screen.getByLabelText('Titre'), 'Aube Nouvelle');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Aube Nouvelle' })).toBeInTheDocument());
    expect(screen.getByText('#nuit')).toBeInTheDocument();
  });
});
