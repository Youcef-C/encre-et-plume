import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

function makeContext(accountId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ accountId }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { account: { findUniqueOrThrow: jest.Mock } };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { account: { findUniqueOrThrow: jest.fn() } };
    guard = new RolesGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it('allows when no roles metadata is declared (session-only route)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const result = await guard.canActivate(makeContext('id-1'));
    expect(result).toBe(true);
    expect(prisma.account.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('allows admin on @Roles("admin") route (BE-AC1)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'admin', verified: false });
    const result = await guard.canActivate(makeContext('id-admin'));
    expect(result).toBe(true);
  });

  it('rejects utilisateur on @Roles("admin") with 403 (BE-AC3)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin']);
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'utilisateur', verified: false });
    await expect(guard.canActivate(makeContext('id-user'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows verified editor on @Roles("editor") (BE-AC5)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['editor']);
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'editor', verified: true });
    const result = await guard.canActivate(makeContext('id-editor'));
    expect(result).toBe(true);
  });

  it('rejects unverified editor on @Roles("editor") with 403 (BE-AC5)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['editor']);
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'editor', verified: false });
    await expect(guard.canActivate(makeContext('id-editor-unverified'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows maintainer on @Roles("maintainer", "admin") (multi-role allow-list)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['maintainer', 'admin']);
    prisma.account.findUniqueOrThrow.mockResolvedValue({ role: 'maintainer', verified: false });
    const result = await guard.canActivate(makeContext('id-maintainer'));
    expect(result).toBe(true);
  });
});
