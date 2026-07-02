import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, requestPasswordReset: vi.fn() };
});

import * as api from '../lib/api';
import MotDePasseOublieClient from '../app/mot-de-passe-oublie/MotDePasseOublieClient';

describe('MotDePasseOublieClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submitting disables the button and shows "Envoi…"', async () => {
    vi.mocked(api.requestPasswordReset).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<MotDePasseOublieClient />);

    await user.type(screen.getByLabelText(/e-mail/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /envoi/i })).toBeDisabled();
    });
  });

  it('shows exact non-enumerating message on success', async () => {
    vi.mocked(api.requestPasswordReset).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<MotDePasseOublieClient />);

    await user.type(screen.getByLabelText(/e-mail/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Si un compte existe pour cette adresse/),
      ).toBeInTheDocument();
    });
  });

  it('shows rate-limited message on 429', async () => {
    vi.mocked(api.requestPasswordReset).mockRejectedValueOnce({
      statusCode: 429,
      error: 'RATE_LIMITED',
      message: 'Trop de tentatives.',
    });
    const user = userEvent.setup();
    render(<MotDePasseOublieClient />);

    await user.type(screen.getByLabelText(/e-mail/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => {
      expect(screen.getByText(/Trop de tentatives/)).toBeInTheDocument();
    });
  });

  it('has a status region for accessibility on success', async () => {
    vi.mocked(api.requestPasswordReset).mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<MotDePasseOublieClient />);

    await user.type(screen.getByLabelText(/e-mail/i), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });
});
