import { ExecutionContext } from '@nestjs/common';
import { EmailVerifiedGuard } from './email-verified.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_NOT_VERIFIED } from '@encre-et-plume/shared';

function makeContext(accountId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ accountId }) }),
  } as unknown as ExecutionContext;
}

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;
  let prisma: { account: { findUniqueOrThrow: jest.Mock } };

  beforeEach(() => {
    prisma = { account: { findUniqueOrThrow: jest.fn() } };
    guard = new EmailVerifiedGuard(prisma as unknown as PrismaService);
  });

  it('throws 403 EMAIL_NOT_VERIFIED with French message for unverified account', async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({ emailVerifiedAt: null });

    await expect(guard.canActivate(makeContext('acc-1'))).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        error: EMAIL_NOT_VERIFIED,
        message: 'Confirmez votre e-mail pour continuer.',
      }),
    });
  });

  it('returns true for a verified account (emailVerifiedAt is set)', async () => {
    prisma.account.findUniqueOrThrow.mockResolvedValue({ emailVerifiedAt: new Date() });

    const result = await guard.canActivate(makeContext('acc-1'));
    expect(result).toBe(true);
  });
});
