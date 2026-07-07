import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    createSupportTicket: vi.fn(),
    getLastRequestId: vi.fn(() => 'req-abc-123'),
  };
});

import * as api from '../lib/api';
import ContactClient from '../components/contact/ContactClient';

const mockAccount: AccountSummary = {
  id: 'u1',
  displayName: 'Yuki Moreau',
  email: 'yuki@example.com',
  role: 'utilisateur',
  verified: false,
  emailVerified: true,
  slug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date().toISOString(),
  preferences: { theme: 'system' },
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

function renderContact(account: AccountSummary | null = null) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}
    >
      <ContactClient />
    </SessionContext.Provider>,
  );
}

// OnBrandSelect is a combobox listbox (§8): open the trigger, then click the option by its label.
async function pickSujet(user: ReturnType<typeof userEvent.setup>, optionLabel: string) {
  await user.click(screen.getByLabelText(/sujet/i));
  await user.click(screen.getByRole('option', { name: optionLabel }));
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await pickSujet(user, 'Question générale');
  await user.type(screen.getByLabelText(/^nom/i), 'Camille Dupont');
  await user.type(screen.getByLabelText(/e-mail/i), 'camille@example.com');
  await user.type(screen.getByLabelText(/message/i), 'Bonjour, une question.');
}

describe('ContactClient', () => {
  beforeEach(() => {
    vi.mocked(api.createSupportTicket).mockReset();
    vi.mocked(api.createSupportTicket).mockResolvedValue({ ok: true });
    vi.mocked(api.getLastRequestId).mockReturnValue('req-abc-123');
  });

  it('renders the contact-info block: mailto, response window, abuse-report pointer', () => {
    renderContact();
    const mailto = screen.getByRole('link', { name: /support@encre-et-plume\.fr/i });
    expect(mailto).toHaveAttribute('href', 'mailto:support@encre-et-plume.fr');
    expect(screen.getByText(/48 h ouvrées/i)).toBeInTheDocument();
    expect(screen.getByText(/bouton « Signaler »/i)).toBeInTheDocument();
  });

  it('renders the 4 French category labels in a labelled select', async () => {
    const user = userEvent.setup();
    renderContact();
    const select = screen.getByLabelText(/sujet/i);
    expect(select).toHaveAttribute('role', 'combobox');
    await user.click(select);
    for (const label of ['Question générale', 'Problème de compte', 'Signaler un bug', 'Autre']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('signed out: name/email are editable and submit is disabled until valid', async () => {
    const user = userEvent.setup();
    renderContact(null);
    const nom = screen.getByLabelText(/^nom/i);
    const email = screen.getByLabelText(/e-mail/i);
    expect(nom).not.toHaveAttribute('readonly');
    expect(email).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeDisabled();
    await fillValid(user);
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeEnabled();
  });

  it('shows "Adresse e-mail invalide" wired via aria-describedby on invalid email', async () => {
    const user = userEvent.setup();
    renderContact(null);
    const email = screen.getByLabelText(/e-mail/i);
    await user.type(email, 'not-an-email');
    await user.tab();
    const err = await screen.findByText('Adresse e-mail invalide');
    expect(email).toHaveAttribute('aria-describedby', err.getAttribute('id')!);
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows "Message requis" when message is empty on blur', async () => {
    const user = userEvent.setup();
    renderContact(null);
    const message = screen.getByLabelText(/message/i);
    await user.click(message);
    await user.tab();
    expect(await screen.findByText('Message requis')).toBeInTheDocument();
  });

  it('signed in: name and email are prefilled and read-only', () => {
    renderContact(mockAccount);
    const nom = screen.getByLabelText(/^nom/i) as HTMLInputElement;
    const email = screen.getByLabelText(/e-mail/i) as HTMLInputElement;
    expect(nom.value).toBe('Yuki Moreau');
    expect(email.value).toBe('yuki@example.com');
    expect(nom).toHaveAttribute('readonly');
    expect(email).toHaveAttribute('readonly');
  });

  it('bug mode: shows technical context (url / userAgent / requestId)', async () => {
    const user = userEvent.setup();
    renderContact(null);
    await pickSujet(user, 'Signaler un bug');
    const panel = await screen.findByTestId('bug-context');
    expect(within(panel).getByText(/navigator|jsdom/i)).toBeInTheDocument();
    expect(within(panel).getByText(/req-abc-123/)).toBeInTheDocument();
  });

  it('bug mode: "Retirer" drops that field from the submitted context', async () => {
    const user = userEvent.setup();
    renderContact(null);
    await pickSujet(user, 'Signaler un bug');
    await user.type(screen.getByLabelText(/^nom/i), 'Camille Dupont');
    await user.type(screen.getByLabelText(/e-mail/i), 'camille@example.com');
    await user.type(screen.getByLabelText(/message/i), 'Ça plante ici.');

    const panel = await screen.findByTestId('bug-context');
    // Remove the requestId row
    await user.click(within(panel).getByRole('button', { name: /retirer l’identifiant/i }));
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(api.createSupportTicket).toHaveBeenCalled());
    const body = vi.mocked(api.createSupportTicket).mock.calls[0][0];
    expect(body.category).toBe('bug');
    expect(body.context).toBeDefined();
    expect(body.context).not.toHaveProperty('requestId');
    expect(body.context).toHaveProperty('userAgent');
  });

  it('has a hidden honeypot input (aria-hidden, tabIndex -1)', () => {
    const { container } = renderContact(null);
    const hp = container.querySelector('input[name="website"]');
    expect(hp).not.toBeNull();
    expect(hp).toHaveAttribute('aria-hidden', 'true');
    expect(hp).toHaveAttribute('tabindex', '-1');
  });

  it('submit shows busy state then the success view with a reset action', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { ok: true }) => void;
    vi.mocked(api.createSupportTicket).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderContact(null);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    const busyBtn = screen.getByRole('button', { name: /envoi/i });
    expect(busyBtn).toHaveAttribute('aria-busy', 'true');
    expect(busyBtn).toBeDisabled();

    resolve({ ok: true });

    expect(
      await screen.findByText('Message envoyé — nous vous répondrons par e-mail.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nouveau message/i }));
    // Back to a blank form
    expect((screen.getByLabelText(/message/i) as HTMLTextAreaElement).value).toBe('');
  });

  it('on error shows a banner and keeps the entered values', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createSupportTicket).mockRejectedValue({
      statusCode: 429,
      error: 'RATE_LIMITED',
      message: 'Trop de messages envoyés. Réessayez plus tard.',
    });
    renderContact(null);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(
      await screen.findByText('Trop de messages envoyés. Réessayez plus tard.'),
    ).toBeInTheDocument();
    // Message retained for retry
    expect((screen.getByLabelText(/message/i) as HTMLTextAreaElement).value).toBe(
      'Bonjour, une question.',
    );
  });
});
