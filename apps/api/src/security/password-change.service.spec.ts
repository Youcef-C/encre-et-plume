/**
 * BE-5: PasswordChangeService — current-password-verified password change + other-session invalidation.
 */
jest.mock('bcryptjs', () => ({
  compare: jest.fn((pw: string) => Promise.resolve(pw === 'current-password')),
  hash: jest.fn((_pw: string) => Promise.resolve('new-hash')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { PasswordChangeService } from './password-change.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { INVALID_PASSWORD } from '@encre-et-plume/shared';

describe('PasswordChangeService', () => {
  let service: PasswordChangeService;
  let prisma: { account: { findUnique: jest.Mock; update: jest.Mock } };
  let authService: { rotateOtherSessions: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'acc-1',
          email: 'user@test.com',
          displayName: 'Yuki',
          passwordHash: 'old-hash',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    authService = {
      rotateOtherSessions: jest.fn().mockResolvedValue({ token: 'new-jwt', jti: 'new-jti' }),
    };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordChangeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(PasswordChangeService);
  });

  it('throws INVALID_PASSWORD when currentPassword is wrong', async () => {
    await expect(service.change('acc-1', 'wrong-password', 'New-Pass-1!')).rejects.toMatchObject({
      response: expect.objectContaining({ error: INVALID_PASSWORD }),
    });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('updates passwordHash, rotates other sessions, and sends password_changed on success', async () => {
    const result = await service.change('acc-1', 'current-password', 'New-Pass-1!');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { passwordHash: 'new-hash' },
    });
    expect(authService.rotateOtherSessions).toHaveBeenCalledWith('acc-1');
    expect(emailService.send).toHaveBeenCalledWith('password_changed', 'user@test.com', expect.any(Object));
    expect(result.token).toBe('new-jwt');
  });
});
