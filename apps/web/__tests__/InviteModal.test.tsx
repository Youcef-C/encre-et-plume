import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyProjectsResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getMyProjects: vi.fn(),
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

function renderModal(onClose = vi.fn()) {
  render(<InviteModal recipient={recipient} onClose={onClose} />);
  return { onClose };
}

describe('InviteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyProjects).mockResolvedValue(projects);
    vi.mocked(api.createInvitation).mockResolvedValue({} as never);
  });

  it('renders a labelled dialog with the read-only recipient header', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: /inviter théo m\./i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/dessinateur·rice · lyon/i)).toBeInTheDocument();
  });

  it('lists the sender projects as selectable radio rows and toggles selection', async () => {
    const user = userEvent.setup();
    renderModal();
    const lames = await screen.findByRole('radio', { name: /lames de brume/i });
    expect(lames).toHaveAttribute('aria-checked', 'false');
    await user.click(lames);
    expect(lames).toHaveAttribute('aria-checked', 'true');
    // Clicking the selected row again deselects (invite goes unattached).
    await user.click(lames);
    expect(lames).toHaveAttribute('aria-checked', 'false');
  });

  it('shows the optional-project hint when the sender has no projects', async () => {
    vi.mocked(api.getMyProjects).mockResolvedValue({ items: [] });
    renderModal();
    expect(await screen.findByText(/aucun projet pour l'instant/i)).toBeInTheDocument();
  });

  it('bounds the message textarea length', async () => {
    renderModal();
    const textarea = await screen.findByLabelText(/message/i);
    expect(textarea).toHaveAttribute('maxLength', '1000');
  });

  it('sends the invitation with toUser, projectId and message', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByRole('radio', { name: /lames de brume/i }));
    await user.type(screen.getByLabelText(/message/i), 'Salut !');
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(api.createInvitation).toHaveBeenCalledWith({
        toUser: 'theo-1',
        projectId: 'p1',
        message: 'Salut !',
      });
    });
  });

  it('shows the success confirmation after sending', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('radio', { name: /lames de brume/i });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/proposition envoyée à théo m\./i);
    });
  });

  it('renders the API error and keeps the send button disabled after a duplicate 409', async () => {
    vi.mocked(api.createInvitation).mockRejectedValue({
      statusCode: 409,
      error: 'CONFLICT',
      message: 'Une proposition est déjà en attente pour ce créateur.',
    });
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('radio', { name: /lames de brume/i });
    await user.click(screen.getByRole('button', { name: /envoyer l'invitation/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/déjà en attente/i);
    });
    expect(screen.getByRole('button', { name: /envoyer l'invitation/i })).toBeDisabled();
  });

  it('Escape closes the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('the ✕ and "Annuler" buttons close the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(await screen.findByRole('button', { name: /fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
