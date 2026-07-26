import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AccountSearchResponse,
  ContactsResponse,
  CreateInvitationsResponse,
  MyProjectsResponse,
} from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getMyProjects: vi.fn(),
  getContacts: vi.fn(),
  searchAccounts: vi.fn(),
  createInvitation: vi.fn(),
}));
import * as api from '../lib/api';
import InviteModal, { type InviteRecipient } from '../components/collab/InviteModal';

const recipient: InviteRecipient = {
  userId: 'theo-1',
  name: 'Théo M.',
  avatarUrl: null,
  subtitle: 'Dessinateur·rice · Lyon',
};

const projects: MyProjectsResponse = {
  items: [
    { id: 'p1', title: 'Lames de Brume', meta: 'Manga · Seinen · en cours', cover: null },
    { id: 'p2', title: "Spectres d'Avril", meta: 'Manga · Fantastique · en révision', cover: null },
  ],
};

const contacts: ContactsResponse = {
  items: [
    { userId: 'u-alma', slug: 'alma', name: 'Alma R.', avatarUrl: null, role: 'scenariste', city: 'Nantes', mutualProjects: 0, presence: { online: false, lastSeen: null } },
    { userId: 'u-bao', slug: 'bao', name: 'Bao T.', avatarUrl: null, role: 'dessinateur', city: 'Paris', mutualProjects: 1, presence: { online: true, lastSeen: null } },
  ],
};

// The picker pool now comes from GET /accounts/search (contacts first when the query is empty).
const reachable: AccountSearchResponse = {
  items: [
    { id: 'u-alma', name: 'Alma R.', avatarUrl: null, slug: 'alma', isContact: true },
    { id: 'u-bao', name: 'Bao T.', avatarUrl: null, slug: 'bao', isContact: true },
  ],
};

// Envelope helper — the API now always returns { results }.
function envelope(results: CreateInvitationsResponse['results']): CreateInvitationsResponse {
  return { results };
}
const sentResult = (toUser: string): CreateInvitationsResponse['results'][number] => ({
  toUser,
  status: 'sent',
  invitation: { id: `inv-${toUser}` } as never,
});

function renderPrefilled(onClose = vi.fn()) {
  render(<InviteModal recipient={recipient} onClose={onClose} />);
  return { onClose };
}

function renderPicker(onClose = vi.fn()) {
  render(<InviteModal onClose={onClose} />);
  return { onClose };
}

describe('InviteModal — prefilled (single recipient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyProjects).mockResolvedValue(projects);
    vi.mocked(api.getContacts).mockResolvedValue(contacts);
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([sentResult('theo-1')]));
  });

  it('renders a labelled dialog with the read-only recipient header', async () => {
    renderPrefilled();
    const dialog = await screen.findByRole('dialog', { name: /inviter théo m\./i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/dessinateur·rice · lyon/i)).toBeInTheDocument();
    // No contacts multi-select in prefilled mode.
    expect(screen.queryByRole('button', { name: /^contacts/i })).not.toBeInTheDocument();
  });

  it('lists the sender projects as selectable radio rows and toggles selection', async () => {
    const user = userEvent.setup();
    renderPrefilled();
    const lames = await screen.findByRole('radio', { name: /lames de brume/i });
    expect(lames).toHaveAttribute('aria-checked', 'false');
    await user.click(lames);
    expect(lames).toHaveAttribute('aria-checked', 'true');
    await user.click(lames);
    expect(lames).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the optional-project hint when the sender has no projects', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ items: [] });
    renderPrefilled();
    expect(await screen.findByText(/aucun projet pour l'instant/i)).toBeInTheDocument();
  });

  it('bounds the message textarea length', async () => {
    renderPrefilled();
    const textarea = await screen.findByLabelText(/message/i);
    expect(textarea).toHaveAttribute('maxLength', '1000');
  });

  it('sends the Mode-A shape with toUsers, projectId and message', async () => {
    const user = userEvent.setup();
    renderPrefilled();
    await user.click(await screen.findByRole('radio', { name: /lames de brume/i }));
    await user.type(screen.getByLabelText(/message/i), 'Salut !');
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(api.createInvitation).toHaveBeenCalledWith({
        kind: 'direct',
        toUsers: ['theo-1'],
        projectId: 'p1',
        message: 'Salut !',
      });
    });
  });

  it('shows the success confirmation on a sent result', async () => {
    const user = userEvent.setup();
    renderPrefilled();
    await screen.findByRole('radio', { name: /lames de brume/i });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/proposition envoyée à théo m\./i);
    });
  });

  it('renders the duplicate copy and locks the send button on a duplicate result', async () => {
    vi.mocked(api.createInvitation).mockResolvedValue(
      envelope([{ toUser: 'theo-1', status: 'duplicate', invitation: null }]),
    );
    const user = userEvent.setup();
    renderPrefilled();
    await screen.findByRole('radio', { name: /lames de brume/i });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/déjà en attente/i);
    });
    expect(screen.getByRole('button', { name: /envoyer l'invitation/i })).toBeDisabled();
  });

  it('Escape closes the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPrefilled();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('the ✕ and "Annuler" buttons close the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPrefilled();
    await user.click(await screen.findByRole('button', { name: /fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// Contacts-DM follow-up (2026-07-26): the picker's "Contacts" dropdown is retired — it now uses the
// shared ReachableUserSearch (contacts first when idle, anyone reachable when you type) with chips.
describe('InviteModal — picker mode (no recipient)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyProjects).mockResolvedValue(projects);
    vi.mocked(api.searchAccounts).mockResolvedValue(reachable);
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([]));
  });

  it('shows the "Proposer une collab" title and the shared reachable-user search, never a contacts dropdown', async () => {
    renderPicker();
    expect(await screen.findByRole('dialog', { name: /proposer une collab/i })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: /ajouter un·e destinataire/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^contacts$/i })).not.toBeInTheDocument();
    expect(api.getContacts).not.toHaveBeenCalled();
  });

  it('lists the sender contacts as soon as it opens (idle search)', async () => {
    renderPicker();
    expect(await screen.findByRole('option', { name: /alma r\./i })).toBeInTheDocument();
    expect(api.searchAccounts).toHaveBeenCalledWith('');
  });

  it('blocks send with 0 selected and does not call the API', async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole('combobox', { name: /ajouter un·e destinataire/i });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/sélectionnez au moins un·e destinataire/i);
    expect(api.createInvitation).not.toHaveBeenCalled();
  });

  it('removes a picked recipient from its chip', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole('option', { name: /alma r\./i }));
    const chips = screen.getByRole('list', { name: /destinataires sélectionnés/i });
    expect(within(chips).getByText('Alma R.')).toBeInTheDocument();
    await user.click(within(chips).getByRole('button', { name: /retirer alma r\./i }));
    expect(within(chips).queryByText('Alma R.')).not.toBeInTheDocument();
  });

  it('sends the selected recipients and renders per-recipient results', async () => {
    vi.mocked(api.createInvitation).mockResolvedValue(
      envelope([
        { toUser: 'u-alma', status: 'sent', invitation: { id: 'inv-1' } as never },
        { toUser: 'u-bao', status: 'duplicate', invitation: null },
      ]),
    );
    const user = userEvent.setup();
    renderPicker();

    // Pick both people from the search listbox.
    await user.click(await screen.findByRole('option', { name: /alma r\./i }));
    await user.click(await screen.findByRole('option', { name: /bao t\./i }));

    // Plural send label appears with 2+ selected.
    await user.click(screen.getByRole('button', { name: /envoyer les invitations/i }));

    await waitFor(() => {
      expect(api.createInvitation).toHaveBeenCalledWith({
        kind: 'direct',
        toUsers: ['u-alma', 'u-bao'],
      });
    });

    const status = await screen.findByRole('status');
    expect(within(status).getByText(/alma r\./i)).toBeInTheDocument();
    expect(within(status).getByText(/envoyée/i)).toBeInTheDocument();
    expect(within(status).getByText(/bao t\./i)).toBeInTheDocument();
    expect(within(status).getByText(/déjà une proposition en attente/i)).toBeInTheDocument();
  });
});

describe('InviteModal — from-work mode (multi-creator work)', () => {
  const creators: InviteRecipient[] = [
    { userId: 'u-cam', name: 'Camille R.', avatarUrl: null, subtitle: 'Scénariste · Paris' },
    { userId: 'u-yuki', name: 'Yuki M.', avatarUrl: null, subtitle: 'Dessinateur · Lyon' },
  ];
  function renderFromWork(onClose = vi.fn(), c: InviteRecipient[] = creators) {
    render(<InviteModal fromWork={{ title: 'Lames de Brume', creators: c }} onClose={onClose} />);
    return { onClose };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyProjects).mockResolvedValue(projects);
    vi.mocked(api.getContacts).mockResolvedValue(contacts);
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([]));
  });

  it('scopes the recipient picker to the work creators (not getContacts) as inline rows', async () => {
    renderFromWork();
    await screen.findByRole('dialog', { name: /proposer une collab/i });
    // From-work never fetches contacts — the pool is the passed creators.
    expect(api.getContacts).not.toHaveBeenCalled();
    // The creators are inline selectable rows (no dropdown to open).
    expect(await screen.findByRole('checkbox', { name: /camille r\./i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /yuki m\./i })).toBeInTheDocument();
    // A contact who is NOT a creator of this work is absent.
    expect(screen.queryByRole('checkbox', { name: /alma r\./i })).not.toBeInTheDocument();
  });

  it('toggles a creator row selection on click', async () => {
    const user = userEvent.setup();
    renderFromWork();
    const row = await screen.findByRole('checkbox', { name: /camille r\./i });
    expect(row).toHaveAttribute('aria-checked', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-checked', 'true');
    await user.click(row);
    expect(row).toHaveAttribute('aria-checked', 'false');
  });

  it('offers the "Rejoindre ce projet" choice disabled with "Bientôt disponible"', async () => {
    renderFromWork();
    const join = await screen.findByRole('radio', { name: /rejoindre ce projet/i });
    expect(join).toHaveAttribute('aria-disabled', 'true');
    expect(join).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/bientôt disponible/i)).toBeInTheDocument();
    // The active default choice is "Proposer une autre collaboration".
    expect(
      screen.getByRole('radio', { name: /proposer une autre collaboration/i }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('sends toUsers with the cherry-picked creators and names them in the results', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([sentResult('u-cam')]));
    renderFromWork();
    await user.click(await screen.findByRole('checkbox', { name: /camille r\./i }));
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(api.createInvitation).toHaveBeenCalledWith({ kind: 'direct', toUsers: ['u-cam'] });
    });
    const status = await screen.findByRole('status');
    expect(within(status).getByText(/camille r\./i)).toBeInTheDocument();
    expect(within(status).getByText(/envoyée/i)).toBeInTheDocument();
  });

  it('preselects the lone creator when the work has a single creator', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([sentResult('u-cam')]));
    renderFromWork(vi.fn(), [creators[0]]);
    // No manual selection — the sole creator is already selected, so send fires the API.
    await user.click(await screen.findByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(api.createInvitation).toHaveBeenCalledWith({ kind: 'direct', toUsers: ['u-cam'] });
    });
  });
});

// F15-R2 (CS-10 B-1 frontend half) — `GET /projects/mine` is owner-scoped, so a CO-LEADER opening
// the invite modal from /projet/{slug}/groupe got an empty picker and could not attach the project
// they are allowed to invite on. Contained fix: the caller passes the current project's title and
// the modal appends it when the fetched list doesn't contain the preselected id.
describe('InviteModal — defaultProjectId not in the owned list (co-leader)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyProjects).mockResolvedValue(projects);
    vi.mocked(api.getContacts).mockResolvedValue(contacts);
  });

  it('appends the preselected project when the owned list does not contain it', async () => {
    render(
      <InviteModal
        recipient={recipient}
        defaultProjectId="p-coled"
        defaultProjectTitle="E2E CS10 · Groupe"
        onClose={vi.fn()}
      />,
    );
    const option = await screen.findByRole('radio', { name: /E2E CS10 · Groupe/ });
    expect(option).toHaveAttribute('aria-checked', 'true');
  });

  it('sends that projectId with the invitation', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createInvitation).mockResolvedValue(envelope([sentResult('theo-1')]));
    render(
      <InviteModal
        recipient={recipient}
        defaultProjectId="p-coled"
        defaultProjectTitle="E2E CS10 · Groupe"
        onClose={vi.fn()}
      />,
    );
    await screen.findByRole('radio', { name: /E2E CS10 · Groupe/ });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() =>
      expect(api.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p-coled' }),
      ),
    );
  });

  it('does not duplicate a project already returned by /projects/mine', async () => {
    render(
      <InviteModal recipient={recipient} defaultProjectId="p1" defaultProjectTitle="Lames de Brume" onClose={vi.fn()} />,
    );
    await screen.findByRole('radio', { name: /Lames de Brume/ });
    expect(screen.getAllByRole('radio', { name: /Lames de Brume/ })).toHaveLength(1);
  });
});
