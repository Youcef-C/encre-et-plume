import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ACCOUNT = {
  id: 'acc-1',
  displayName: 'Yuki',
  email: 'yuki@test.com',
  passwordHash: 'hash',
  role: 'utilisateur' as const,
  verified: false,
  profileSlug: 'yuki',
  avatar: null,
  preferences: { theme: 'system' },
  createdAt: new Date('2026-01-01'),
  emailVerifiedAt: new Date('2026-01-02'),
  deletedAt: null,
};

// ─── OnboardingService tests ──────────────────────────────────────────────────

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: {
    account: { update: jest.Mock };
    profile: { upsert: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      account: { update: jest.fn().mockResolvedValue({ ...BASE_ACCOUNT, onboardedAt: new Date() }) },
      profile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    service = new OnboardingService(prisma as unknown as PrismaService);
  });

  describe('complete() — happy path', () => {
    it('stamps onboardedAt on the account', async () => {
      await service.complete('acc-1', {});
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'acc-1' }, data: expect.objectContaining({ onboardedAt: expect.any(Date) }) }),
      );
    });

    it('returns an AccountSummary with onboarded: true', async () => {
      const result = await service.complete('acc-1', {});
      expect(result.onboarded).toBe(true);
    });

    it('writes creatorRoles onto the profile when provided', async () => {
      await service.complete('acc-1', { creatorRoles: ['scenariste'] });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ creatorRoles: ['scenariste'] }),
        }),
      );
    });

    it('writes tags onto the profile when provided', async () => {
      await service.complete('acc-1', { tags: ['Seinen', 'Thriller'] });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ tags: ['Seinen', 'Thriller'] }),
        }),
      );
    });

    it('deduplicates tags (trims, case-insensitive dedup)', async () => {
      await service.complete('acc-1', { tags: ['Seinen', 'seinen', ' Seinen '] });
      const upsertCall = (prisma.profile.upsert as jest.Mock).mock.calls[0][0] as { update: { tags: string[] } };
      expect(upsertCall.update.tags).toHaveLength(1);
    });

    it('maps cherche_dessinateur → seekingActive:true, seekingTargetRole:dessinateur·rice', async () => {
      await service.complete('acc-1', { lookingFor: 'cherche_dessinateur' });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ seekingActive: true, seekingTargetRole: 'dessinateur·rice' }),
        }),
      );
    });

    it('maps cherche_scenariste → seekingActive:true, seekingTargetRole:scénariste', async () => {
      await service.complete('acc-1', { lookingFor: 'cherche_scenariste' });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ seekingActive: true, seekingTargetRole: 'scénariste' }),
        }),
      );
    });

    it('maps ouvert → seekingActive:true, seekingTargetRole:null', async () => {
      await service.complete('acc-1', { lookingFor: 'ouvert' });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ seekingActive: true, seekingTargetRole: null }),
        }),
      );
    });

    it('maps regarde → seekingActive:false, seekingTargetRole:null', async () => {
      await service.complete('acc-1', { lookingFor: 'regarde' });
      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ seekingActive: false, seekingTargetRole: null }),
        }),
      );
    });
  });

  describe('complete() — skip path', () => {
    it('does not call profile.upsert when body is empty (skip stamps onboardedAt only)', async () => {
      await service.complete('acc-1', {});
      expect(prisma.profile.upsert).not.toHaveBeenCalled();
    });

    it('does not call profile.upsert when no writable fields are provided', async () => {
      await service.complete('acc-1', { creatorRoles: undefined, tags: undefined, lookingFor: undefined });
      expect(prisma.profile.upsert).not.toHaveBeenCalled();
    });
  });

  describe('complete() — idempotency', () => {
    it('is idempotent: second call overwrites profile fields with no error', async () => {
      await service.complete('acc-1', { tags: ['Seinen'] });
      await service.complete('acc-1', { tags: ['Thriller'] });
      expect(prisma.profile.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.account.update).toHaveBeenCalledTimes(2);
    });
  });
});
