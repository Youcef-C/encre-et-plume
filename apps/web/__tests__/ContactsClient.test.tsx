import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AccountSummary,
  ContactItem,
  ConnectionRequestItem,
  MatchSuggestion,
  PeopleSearchItem,
} from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getContacts: vi.fn(),
    getConnectionRequests: vi.fn(),
    getConnectionSuggestions: vi.fn(),
    searchPeople: vi.fn(),
    sendConnectionRequest: vi.fn(),
    decideConnectionRequest: vi.fn(),
    removeContact: vi.fn(),
    createBlock: vi.fn().mockResolvedValue({ id: 'b1', userId: 'u-lea', kind: 'block', createdAt: '2026-07-08T00:00:00.000Z' }),
  };
});

const openDm = vi.fn();
vi.mock('../lib/messaging', () => ({
  useMessaging: () => ({ openDm }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import * as api from '../lib/api';
import ContactsClient from '../components/contacts/ContactsClient';

const account: AccountSummary = {
  id: 'me-1',
  displayName: 'Camille R.',
  email: 'camille@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-r',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const contact = (over: Partial<ContactItem> = {}): ContactItem => ({
  userId: 'u-lea',
  slug: 'lea-b',
  name: 'Léa B.',
  avatarUrl: null,
  role: 'dessinateur',
  city: 'Lyon',
  mutualProjects: 2,
  presence: { online: true, lastSeen: '2026-07-08T12:00:00.000Z' },
  ...over,
});

const request = (over: Partial<ConnectionRequestItem> = {}): ConnectionRequestItem => ({
  id: 'req-1',
  from: { userId: 'u-noe', slug: 'noe-p', name: 'Noé P.', avatarUrl: null, role: 'scenariste' },
  context: 'souhaite se connecter',
  createdAt: '2026-07-07T09:00:00.000Z',
  ...over,
});

const suggestion = (over: Partial<MatchSuggestion> = {}): MatchSuggestion => ({
  userId: 'u-mika',
  slug: 'mika-t',
  name: 'Mika T.',
  avatarUrl: null,
  role: 'scenariste',
  genre: 'Seinen',
  affinityScore: 82,
  reason: 'même genre · rythme compatible',
  ...over,
});

const searchItem = (over: Partial<PeopleSearchItem> = {}): PeopleSearchItem => ({
  userId: 'u-search',
  slug: 'search-p',
  name: 'Sacha V.',
  avatarUrl: null,
  role: 'dessinateur',
  location: 'Nantes',
  connectionState: 'none',
  ...over,
});

function mockAll(opts: {
  contacts?: ContactItem[];
  requests?: ConnectionRequestItem[];
  suggestions?: MatchSuggestion[];
  incompleteProfile?: boolean;
} = {}) {
  vi.mocked(api.getContacts).mockResolvedValue({ items: opts.contacts ?? [contact()] });
  vi.mocked(api.getConnectionRequests).mockResolvedValue({ items: opts.requests ?? [request()] });
  vi.mocked(api.getConnectionSuggestions).mockResolvedValue({
    items: opts.suggestions ?? [suggestion()],
    incompleteProfile: opts.incompleteProfile ?? false,
  });
}

function renderClient(acc: AccountSummary | null = account) {
  return render(
    <SessionContext.Provider
      value={{ account: acc, loading: false, refresh: vi.fn(), logout: vi.fn().mockResolvedValue(undefined) }}
    >
      <ContactsClient />
    </SessionContext.Provider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ContactsClient — tabs & counts (FE-1)', () => {
  it('renders the page title and three tabs with live counts + badge', async () => {
    mockAll({ contacts: [contact(), contact({ userId: 'u2', name: 'Hugo D.' })], requests: [request(), request({ id: 'req-2' })] });
    renderClient();

    expect(screen.getByRole('heading', { name: /contacts & connexions/i })).toBeInTheDocument();

    const tabs = await screen.findByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /contacts · 2/i })).toBeInTheDocument();
    // Demandes tab announces its pending count in the accessible name
    expect(within(tabs).getByRole('tab', { name: /demandes.*2/i })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /suggestions/i })).toBeInTheDocument();
  });
});

describe('ContactsClient — block a contact (MC-10)', () => {
  it('blocks from the row menu, confirms, and removes the row locally', async () => {
    mockAll({ contacts: [contact()] });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('button', { name: /actions pour léa b\./i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bloquer Léa B.' }));
    // Confirmation modal, then confirm.
    const dialog = await screen.findByRole('dialog', { name: /bloquer léa b\./i });
    await user.click(within(dialog).getByRole('button', { name: 'Bloquer' }));

    await waitFor(() => expect(api.createBlock).toHaveBeenCalledWith({ userId: 'u-lea', kind: 'block' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Léa B.' })).not.toBeInTheDocument());
  });
});

describe('ContactsClient — Ajouter un contact focuses search (FE-2)', () => {
  it('the "Ajouter un contact" button focuses the labelled search field with the exact placeholder', async () => {
    mockAll();
    const user = userEvent.setup();
    renderClient();
    await screen.findByRole('tablist');

    const searchInput = screen.getByRole('searchbox', { name: /rechercher des personnes/i });
    expect(searchInput).toHaveAttribute('placeholder', 'nom, rôle, genre, région…');

    await user.click(screen.getByRole('button', { name: /ajouter un contact/i }));
    expect(searchInput).toHaveFocus();
  });
});

describe('ContactsClient — Demandes tab (FE-3, FE-6)', () => {
  it('shows a request row with name, role chip, context line and named accept/refuse buttons', async () => {
    mockAll({ requests: [request()] });
    const user = userEvent.setup();
    renderClient();
    await user.click(await screen.findByRole('tab', { name: /demandes/i }));
    await screen.findByText(/souhaite se connecter/i);

    expect(screen.getByText('Noé P.')).toBeInTheDocument();
    expect(screen.getByText('Scénariste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accepter la demande de noé p\./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refuser la demande de noé p\./i })).toBeInTheDocument();
  });

  it('accepting a request removes the row, decrements the badge and bumps the contacts count', async () => {
    mockAll({ contacts: [contact()], requests: [request()] });
    vi.mocked(api.decideConnectionRequest).mockResolvedValue({ id: 'req-1', status: 'accepted' });
    const user = userEvent.setup();
    renderClient();

    const tabs = await screen.findByRole('tablist');
    expect(within(tabs).getByRole('tab', { name: /contacts · 1/i })).toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: /demandes/i }));
    await user.click(await screen.findByRole('button', { name: /accepter la demande de noé p\./i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /accepter la demande de noé p\./i })).not.toBeInTheDocument(),
    );
    expect(api.decideConnectionRequest).toHaveBeenCalledWith('req-1', 'accepted');
    // Contacts count bumped 1 → 2, Demandes badge gone (0 pending)
    expect(within(tabs).getByRole('tab', { name: /contacts · 2/i })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: /aucune demande|demandes(?!.*\d)/i })).toBeInTheDocument();
  });

  it('rolls the row back and shows an inline error when accept fails', async () => {
    mockAll({ requests: [request()] });
    vi.mocked(api.decideConnectionRequest).mockRejectedValue({ message: 'Erreur' });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('tab', { name: /demandes/i }));
    await user.click(await screen.findByRole('button', { name: /accepter la demande de noé p\./i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accepter la demande de noé p\./i })).toBeInTheDocument();
  });
});

describe('ContactsClient — Contacts tab (FE-4, FE-7, D5, D7)', () => {
  it('shows presence text, meta, an enabled Message button (MC-9) and an overflow menu', async () => {
    mockAll({
      contacts: [contact({ presence: { online: true, lastSeen: null } })],
      requests: [],
    });
    const user = userEvent.setup();
    renderClient();

    // Default tab is Contacts
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
    expect(screen.getByText(/en ligne/i)).toBeInTheDocument();
    expect(screen.getByText(/lyon/i)).toBeInTheDocument();

    // MC-9 seam is live: « Message » opens (or starts) the DM in the widget.
    const message = screen.getByRole('button', { name: /message à léa b\./i });
    expect(message).toBeEnabled();
    await user.click(message);
    expect(openDm).toHaveBeenCalledWith('u-lea');

    await user.click(screen.getByRole('button', { name: /actions pour léa b\./i }));
    expect(await screen.findByRole('menuitem', { name: /voir le profil/i })).toHaveAttribute('href', '/lea-b');
    expect(screen.getByRole('menuitem', { name: /retirer le contact/i })).toBeInTheDocument();
  });

  it('shows "hors ligne" when offline with no last-seen and "vu" when offline with a timestamp', async () => {
    mockAll({
      contacts: [
        contact({ userId: 'a', name: 'Off Un', presence: { online: false, lastSeen: null } }),
        contact({
          userId: 'b',
          name: 'Off Deux',
          presence: { online: false, lastSeen: new Date(Date.now() - 2 * 3600_000).toISOString() },
        }),
      ],
      requests: [],
    });
    renderClient();

    expect(await screen.findByText(/hors ligne/i)).toBeInTheDocument();
    expect(screen.getByText(/vu il y a 2 h/i)).toBeInTheDocument();
  });

  it('removing a contact after inline confirm drops the row and decrements the count', async () => {
    mockAll({ contacts: [contact()], requests: [] });
    vi.mocked(api.removeContact).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderClient();

    const tabs = await screen.findByRole('tablist');
    await user.click(await screen.findByRole('button', { name: /actions pour léa b\./i }));
    await user.click(await screen.findByRole('menuitem', { name: /retirer le contact/i }));
    // Inline on-brand confirm (never window.confirm)
    await user.click(await screen.findByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(api.removeContact).toHaveBeenCalledWith('u-lea'));
    await waitFor(() => expect(screen.queryByText('Léa B.')).not.toBeInTheDocument());
    expect(within(tabs).getByRole('tab', { name: /contacts · 0/i })).toBeInTheDocument();
  });
});

describe('ContactsClient — Suggestions tab (FE-5)', () => {
  it('shows suggestion cards and optimistically removes one on "Se connecter"', async () => {
    mockAll({ suggestions: [suggestion()] });
    vi.mocked(api.sendConnectionRequest).mockResolvedValue({ id: 'new', status: 'pending' });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('tab', { name: /suggestions/i }));
    expect(await screen.findByText('Mika T.')).toBeInTheDocument();
    expect(screen.getByText(/seinen/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /se connecter avec mika t\./i }));

    await waitFor(() => expect(api.sendConnectionRequest).toHaveBeenCalledWith('u-mika'));
    await waitFor(() => expect(screen.queryByText('Mika T.')).not.toBeInTheDocument());
  });
});

describe('ContactsClient — states (FE-6)', () => {
  it('shows the three verbatim empty strings per tab', async () => {
    mockAll({ contacts: [], requests: [], suggestions: [] });
    const user = userEvent.setup();
    renderClient();

    expect(await screen.findByText('Aucun contact')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /demandes/i }));
    expect(await screen.findByText('Aucune demande')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /suggestions/i }));
    expect(await screen.findByText('Aucune suggestion')).toBeInTheDocument();
  });

  it('shows an error with a Réessayer retry that refetches the tab', async () => {
    vi.mocked(api.getConnectionRequests).mockResolvedValue({ items: [] });
    vi.mocked(api.getConnectionSuggestions).mockResolvedValue({ items: [], incompleteProfile: false });
    vi.mocked(api.getContacts).mockRejectedValueOnce({ message: 'boom' }).mockResolvedValue({ items: [contact()] });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('button', { name: /réessayer/i }));
    expect(await screen.findByText('Léa B.')).toBeInTheDocument();
  });

  it('Demandes tab has its own independent error + Réessayer retry', async () => {
    vi.mocked(api.getContacts).mockResolvedValue({ items: [] });
    vi.mocked(api.getConnectionSuggestions).mockResolvedValue({ items: [], incompleteProfile: false });
    vi.mocked(api.getConnectionRequests)
      .mockRejectedValueOnce({ message: 'boom' })
      .mockResolvedValue({ items: [request()] });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('tab', { name: /demandes/i }));
    expect(await screen.findByText('Impossible de charger les demandes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(await screen.findByText('Noé P.')).toBeInTheDocument();
  });

  it('Suggestions tab has its own independent error + Réessayer retry', async () => {
    vi.mocked(api.getContacts).mockResolvedValue({ items: [] });
    vi.mocked(api.getConnectionRequests).mockResolvedValue({ items: [] });
    vi.mocked(api.getConnectionSuggestions)
      .mockRejectedValueOnce({ message: 'boom' })
      .mockResolvedValue({ items: [suggestion()], incompleteProfile: false });
    const user = userEvent.setup();
    renderClient();

    await user.click(await screen.findByRole('tab', { name: /suggestions/i }));
    expect(await screen.findByText('Impossible de charger les suggestions.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(await screen.findByText('Mika T.')).toBeInTheDocument();
  });
});

describe('ContactsClient — logged-out state', () => {
  it('shows a connect prompt instead of the tabs when there is no session', () => {
    renderClient(null);

    expect(screen.getByRole('heading', { name: /contacts & connexions/i })).toBeInTheDocument();
    expect(
      screen.getByText('Connectez-vous pour retrouver vos contacts et vos demandes de connexion.'),
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /se connecter/i });
    expect(link).toHaveAttribute('href', '/connexion?redirect=/contacts');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('ContactsClient — scoped search (FE-2, D12)', () => {
  it('debounced search renders result rows with a state-appropriate CTA', async () => {
    mockAll({ requests: [] });
    vi.mocked(api.searchPeople).mockResolvedValue({
      items: [
        searchItem({ userId: 'a', name: 'Sacha V.', connectionState: 'none' }),
        searchItem({ userId: 'b', name: 'Elias R.', connectionState: 'pending_out' }),
        searchItem({ userId: 'c', name: 'Nora K.', connectionState: 'connected' }),
      ],
    });
    const user = userEvent.setup();
    renderClient();
    await screen.findByRole('tablist');

    await user.type(screen.getByRole('searchbox', { name: /rechercher des personnes/i }), 'sa');

    expect(await screen.findByText('Sacha V.')).toBeInTheDocument();
    await waitFor(() => expect(api.searchPeople).toHaveBeenCalledWith('sa'));
    // none → Se connecter, pending_out → Demande envoyée (disabled), connected → Déjà en contact
    expect(screen.getByRole('button', { name: /se connecter avec sacha v\./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /demande envoyée/i })).toBeDisabled();
    expect(screen.getByText(/déjà en contact/i)).toBeInTheDocument();
  });
});
