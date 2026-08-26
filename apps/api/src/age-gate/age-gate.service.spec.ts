import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AgeGateService } from './age-gate.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AgeGateService.assertMayView18Plus (DR-10 BE-5 — authz matrix)', () => {
  let service: AgeGateService;
  let prisma: { account: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { account: { findUnique: jest.fn() } };
    service = new AgeGateService(prisma as unknown as PrismaService);
  });

  it('visitor (accountId undefined) → allowed, no DB lookup', async () => {
    await expect(service.assertMayView18Plus(undefined)).resolves.toBeUndefined();
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });

  it('logged-in account with no birthdate on file → allowed (D3: server has no verifiable age)', async () => {
    prisma.account.findUnique.mockResolvedValue({ birthdate: null, role: 'utilisateur' });
    await expect(service.assertMayView18Plus('acc-1')).resolves.toBeUndefined();
  });

  it('logged-in adult (birthdate >= 18y ago) → allowed', async () => {
    prisma.account.findUnique.mockResolvedValue({ birthdate: new Date('1990-01-01'), role: 'utilisateur' });
    await expect(service.assertMayView18Plus('acc-1')).resolves.toBeUndefined();
  });

  it('logged-in minor → throws 403 ForbiddenException with AGE_RESTRICTED error code', async () => {
    const now = new Date();
    const minorBirthdate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    prisma.account.findUnique.mockResolvedValue({ birthdate: minorBirthdate, role: 'utilisateur' });

    await expect(service.assertMayView18Plus('acc-1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.assertMayView18Plus('acc-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        statusCode: 403,
        message: 'Ce contenu est réservé aux adultes.',
        error: 'AGE_RESTRICTED',
      }),
    });
  });

  it('staff exemption: a maintainer flagged as a minor is still allowed (AD-4)', async () => {
    const now = new Date();
    const minorBirthdate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    prisma.account.findUnique.mockResolvedValue({ birthdate: minorBirthdate, role: 'maintainer' });

    await expect(service.assertMayView18Plus('acc-1')).resolves.toBeUndefined();
  });

  it('staff exemption: an admin flagged as a minor is still allowed (AD-4)', async () => {
    const now = new Date();
    const minorBirthdate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    prisma.account.findUnique.mockResolvedValue({ birthdate: minorBirthdate, role: 'admin' });

    await expect(service.assertMayView18Plus('acc-1')).resolves.toBeUndefined();
  });

  it('editor role is NOT staff-exempt (only maintainer/admin, per F-2 staff tiers)', async () => {
    const now = new Date();
    const minorBirthdate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    prisma.account.findUnique.mockResolvedValue({ birthdate: minorBirthdate, role: 'editor' });

    await expect(service.assertMayView18Plus('acc-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // B-5 — a Redis blip used to downgrade a signed-in minor to a visitor, and visitors are gated
  // only by DR-10's clickable client interstitial. "Could not resolve" must refuse, not assume.
  describe('degraded identity (B-5)', () => {
    it('refuses with 503 when identity could not be resolved, even with no accountId', async () => {
      await expect(service.assertMayView18Plus(undefined, true)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // and it must not have needed the DB to decide that
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });

    it('still lets a genuine visitor through — the flag is the only difference', async () => {
      await expect(service.assertMayView18Plus(undefined, false)).resolves.toBeUndefined();
      await expect(service.assertMayView18Plus(undefined)).resolves.toBeUndefined();
    });
  });
});
