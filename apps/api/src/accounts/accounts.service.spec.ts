import { NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';

const BASE_ACCOUNT = {
  id: 'cuid-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  passwordHash: 'hash',
  role: 'utilisateur' as const,
  verified: false,
  profileSlug: 'yuki-moreau',
  avatar: null,
  preferences: { theme: 'system' },
  createdAt: new Date('2026-01-01'),
};

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: { account: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { account: { findUnique: jest.fn(), update: jest.fn() } };
    service = new AccountsService(prisma as unknown as PrismaService);
  });

  it('updates role and returns AccountSummary (BE-AC4, BE-AC7)', async () => {
    const updated = { ...BASE_ACCOUNT, role: 'editor' as const, verified: false };
    prisma.account.findUnique.mockResolvedValue(BASE_ACCOUNT);
    prisma.account.update.mockResolvedValue(updated);

    const result = await service.updateRole('cuid-1', 'editor');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'cuid-1' },
      data: { role: 'editor' },
    });
    expect(result.role).toBe('editor');
    expect(result.verified).toBe(false);
  });

  it('throws NotFoundException for unknown account id (BE-AC5 404 branch)', async () => {
    prisma.account.findUnique.mockResolvedValue(null);
    await expect(service.updateRole('bad-id', 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('F-6: updatePreferences', () => {
    it('persists theme and returns AccountSummary with updated preference', async () => {
      const updated = { ...BASE_ACCOUNT, preferences: { theme: 'dark' } };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.updatePreferences('cuid-1', 'dark');

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { preferences: { theme: 'dark' } },
      });
      expect(result.preferences).toEqual({ theme: 'dark' });
      expect(result.id).toBe('cuid-1');
    });

    it('handles absent preferences column gracefully (defaults to system)', async () => {
      const updated = { ...BASE_ACCOUNT, preferences: undefined };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.updatePreferences('cuid-1', 'system');
      expect(result.preferences).toEqual({ theme: 'system' });
    });
  });
});
