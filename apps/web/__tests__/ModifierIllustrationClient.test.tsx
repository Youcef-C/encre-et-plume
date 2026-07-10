// CS-13 FE-3 — full-page owner editor at /illustration/:id/modifier. Owner sees the header + prefilled
// shared fields + a back link; a non-owner or unknown id gets "Illustration introuvable" and NO form;
// anonymous is redirected to /connexion; Annuler/Enregistrer navigate; a server error is preserved.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, IllustrationDetail } from '@encre-et-plume/shared';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

let sessionAccount: AccountSummary | null = null;
let sessionLoading = false;
vi.mock('../lib/session', () => ({ useSession: () => ({ account: sessionAccount, loading: sessionLoading }) }));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getIllustration: vi.fn(), updateIllustration: vi.fn() };
});

// Stub the F-10 upload slot (no network in the page test).
vi.mock('../components/UploadControl', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

import * as api from '../lib/api';
import ModifierIllustrationClient from '../components/illustration/ModifierIllustrationClient';

const owner: AccountSummary = { id: 'acc-yuki' } as AccountSummary;
const stranger: AccountSummary = { id: 'acc-other' } as AccountSummary;

function makeDetail(overrides: Partial<IllustrationDetail> = {}): IllustrationDetail {
  return {
    id: 'i1', title: 'Aube', description: 'Une aube.', category: 'personnages', categoryLabel: 'Personnages',
    genres: [], hashtags: ['encre'], image: null, dimensionsLabel: null, tools: 'Encre · CSP', license: null,
    likeCount: 0, publishedAt: '2026-01-01T00:00:00.000Z',
    artist: { id: 'acc-yuki', name: 'Yuki', slug: 'yuki-moreau', role: 'Dessinateur·rice', city: null, avatar: null },
    is18plus: false, collections: [],
    ...overrides,
  };
}

describe('ModifierIllustrationClient (CS-13 FE-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAccount = owner;
    sessionLoading = false;
  });

  it('renders the header, prefilled fields and a back link for the owner', async () => {
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    render(<ModifierIllustrationClient id="i1" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Modifier l’illustration' })).toBeInTheDocument(),
    );
    expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Aube');
    expect(screen.getByRole('link', { name: /Illustration/ })).toHaveAttribute('href', '/illustration/i1');
  });

  it('shows "Illustration introuvable" and NO form for a non-owner', async () => {
    sessionAccount = stranger;
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    render(<ModifierIllustrationClient id="i1" />);
    await waitFor(() => expect(screen.getByText('Illustration introuvable')).toBeInTheDocument());
    expect(screen.queryByLabelText('Titre')).not.toBeInTheDocument();
  });

  it('shows "Illustration introuvable" for an unknown id (404)', async () => {
    vi.mocked(api.getIllustration).mockRejectedValue({ statusCode: 404, message: 'Illustration introuvable' });
    render(<ModifierIllustrationClient id="nope" />);
    await waitFor(() => expect(screen.getByText('Illustration introuvable')).toBeInTheDocument());
    expect(screen.queryByLabelText('Titre')).not.toBeInTheDocument();
  });

  it('redirects an anonymous visitor to /connexion', async () => {
    sessionAccount = null;
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    render(<ModifierIllustrationClient id="i1" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/connexion'));
  });

  it('Annuler navigates back to the detail page', async () => {
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    const user = userEvent.setup();
    render(<ModifierIllustrationClient id="i1" />);
    await screen.findByLabelText('Titre');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(push).toHaveBeenCalledWith('/illustration/i1');
  });

  it('Enregistrer PATCHes and returns to the detail page', async () => {
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    vi.mocked(api.updateIllustration).mockResolvedValue(makeDetail({ title: 'Crépuscule' }));
    const user = userEvent.setup();
    render(<ModifierIllustrationClient id="i1" />);
    await screen.findByLabelText('Titre');

    await user.clear(screen.getByLabelText('Titre'));
    await user.type(screen.getByLabelText('Titre'), 'Crépuscule');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(api.updateIllustration).toHaveBeenCalledWith('i1', expect.objectContaining({ title: 'Crépuscule' })),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/illustration/i1'));
  });

  it('blocks an empty title with an inline error and no request', async () => {
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    const user = userEvent.setup();
    render(<ModifierIllustrationClient id="i1" />);
    await screen.findByLabelText('Titre');
    await user.clear(screen.getByLabelText('Titre'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Un titre est requis')).toBeInTheDocument();
    expect(api.updateIllustration).not.toHaveBeenCalled();
  });

  it('shows a French error and preserves values when the PATCH fails', async () => {
    vi.mocked(api.getIllustration).mockResolvedValue(makeDetail());
    vi.mocked(api.updateIllustration).mockRejectedValue({ statusCode: 400, message: 'Catégorie invalide' });
    const user = userEvent.setup();
    render(<ModifierIllustrationClient id="i1" />);
    await screen.findByLabelText('Titre');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catégorie invalide');
    expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Aube');
    expect(push).not.toHaveBeenCalled();
  });
});
