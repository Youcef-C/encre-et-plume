import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityTwoFactor from '../components/security/SecurityTwoFactor';

vi.mock('../lib/api', () => ({
  getSecurityOverview: vi.fn(),
  twoFactorSetup: vi.fn(),
  twoFactorConfirm: vi.fn(),
  twoFactorDisable: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,MOCK'),
  },
}));

import * as api from '../lib/api';

describe('SecurityTwoFactor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('disabled state', () => {
    beforeEach(() => {
      vi.mocked(api.getSecurityOverview).mockResolvedValue({
        twoFactorEnabled: false,
        pendingEmail: null,
      });
    });

    it('shows "Désactivée" status and "Activer" button', async () => {
      render(<SecurityTwoFactor />);
      expect(await screen.findByText(/désactivée/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /activer/i })).toBeInTheDocument();
    });

    it('calls twoFactorSetup and renders QR + copyable secret + code input', async () => {
      vi.mocked(api.twoFactorSetup).mockResolvedValue({
        provisioningUri: 'otpauth://totp/Encre%20%26%20Plume:test@example.com?secret=BASE32SECRET',
        secret: 'BASE32SECRET',
      });
      const user = userEvent.setup();
      render(<SecurityTwoFactor />);
      await screen.findByRole('button', { name: /activer/i });

      await user.click(screen.getByRole('button', { name: /activer/i }));

      expect(await screen.findByText('BASE32SECRET')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /qr code/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/code de vérification/i)).toBeInTheDocument();
    });

    it('submits confirm code and shows backup codes once with warning', async () => {
      vi.mocked(api.twoFactorSetup).mockResolvedValue({
        provisioningUri: 'otpauth://totp/test',
        secret: 'TOPSECRET',
      });
      vi.mocked(api.twoFactorConfirm).mockResolvedValue({
        backupCodes: ['abcd-1234', 'efgh-5678', 'ijkl-9012'],
      });
      const user = userEvent.setup();
      render(<SecurityTwoFactor />);
      await user.click(await screen.findByRole('button', { name: /activer/i }));
      await screen.findByLabelText(/code de vérification/i);

      await user.type(screen.getByLabelText(/code de vérification/i), '123456');
      await user.click(screen.getByRole('button', { name: /confirmer/i }));

      expect(await screen.findByText(/conservez-les précieusement/i)).toBeInTheDocument();
      expect(screen.getByText('abcd-1234')).toBeInTheDocument();
      expect(screen.getByText('efgh-5678')).toBeInTheDocument();
    });

    it('shows "Code invalide." on TWO_FACTOR_INVALID_CODE', async () => {
      vi.mocked(api.twoFactorSetup).mockResolvedValue({
        provisioningUri: 'otpauth://totp/test',
        secret: 'SECRET',
      });
      vi.mocked(api.twoFactorConfirm).mockRejectedValue({
        error: 'TWO_FACTOR_INVALID_CODE',
        message: 'Code invalide.',
      });
      const user = userEvent.setup();
      render(<SecurityTwoFactor />);
      await user.click(await screen.findByRole('button', { name: /activer/i }));
      await screen.findByLabelText(/code de vérification/i);

      await user.type(screen.getByLabelText(/code de vérification/i), '000000');
      await user.click(screen.getByRole('button', { name: /confirmer/i }));

      expect(await screen.findByText('Code invalide.')).toBeInTheDocument();
    });
  });

  describe('enabled state', () => {
    beforeEach(() => {
      vi.mocked(api.getSecurityOverview).mockResolvedValue({
        twoFactorEnabled: true,
        pendingEmail: null,
      });
    });

    it('shows "Activée" status and "Désactiver" button', async () => {
      render(<SecurityTwoFactor />);
      expect(await screen.findByText(/activée/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /désactiver/i })).toBeInTheDocument();
    });

    it('opens disable modal with password + code fields', async () => {
      const user = userEvent.setup();
      render(<SecurityTwoFactor />);
      await user.click(await screen.findByRole('button', { name: /désactiver/i }));

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
    });

    it('calls twoFactorDisable and returns to disabled state', async () => {
      vi.mocked(api.twoFactorDisable).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(<SecurityTwoFactor />);
      await user.click(await screen.findByRole('button', { name: /désactiver/i }));
      await screen.findByRole('dialog');

      await user.type(screen.getByLabelText(/mot de passe/i), 'secret123');
      await user.type(screen.getByLabelText(/code/i), '123456');
      await user.click(screen.getByRole('button', { name: /confirmer la désactivation/i }));

      await waitFor(() => {
        expect(vi.mocked(api.twoFactorDisable)).toHaveBeenCalledWith({
          password: 'secret123',
          code: '123456',
        });
      });
      expect(await screen.findByText(/désactivée/i)).toBeInTheDocument();
    });
  });
});
