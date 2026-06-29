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
});
