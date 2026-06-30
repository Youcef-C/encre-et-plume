import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProfilesService } from './profiles.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ACCOUNT = {
  id: 'acc-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  passwordHash: 'hash',
  role: 'utilisateur' as const,
  verified: false,
  profileSlug: 'yuki-moreau',
  avatar: null,
  createdAt: new Date('2026-01-01'),
};

const BASE_PROFILE = {
  id: 'prof-1',
  accountId: 'acc-1',
  coverImage: null,
  specialty: 'encre & screentone',
  city: 'Lyon, FR',
  bio: 'Ma bio',
  seekingActive: false,
  seekingTargetRole: null,
  seekingGenres: [] as string[],
  seekingProjectLength: null,
  tags: ['Seinen', 'Thriller'] as string[],
  createdAt: new Date('2026-01-01'),
};

const PORTFOLIO_ITEM = {
  id: 'item-1',
  profileId: 'prof-1',
  image: 'https://example.com/img.jpg',
  caption: 'My art',
  order: 0,
  createdAt: new Date('2026-01-01'),
};

// ─── ProfilesService tests ─────────────────────────────────────────────────────

describe('ProfilesService', () => {
  let service: ProfilesService;
  let prisma: {
    account: { findUnique: jest.Mock };
    profile: { upsert: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      account: { findUnique: jest.fn() },
      profile: { upsert: jest.fn() },
    };
    service = new ProfilesService(prisma as unknown as PrismaService);
  });

  // ── getBySlug ────────────────────────────────────────────────────────────────

  describe('getBySlug', () => {
    it('returns composed ProfileResponse when profile row exists', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: BASE_PROFILE });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.slug).toBe('yuki-moreau');
      expect(res.displayName).toBe('Yuki Moreau');
      expect(res.tags).toEqual(['Seinen', 'Thriller']);
      expect(res.specialty).toBe('encre & screentone');
      expect(res.city).toBe('Lyon, FR');
      expect(res.roleLine).toBe('encre & screentone · Lyon, FR');
      expect(res.counters).toEqual({ followers: 0, likes: 0, works: 0, supporters: 0 });
    });

    it('returns default nulls/empty arrays when no Profile row exists (D6)', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: null });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.slug).toBe('yuki-moreau');
      expect(res.coverImage).toBeNull();
      expect(res.roleLine).toBeNull();
      expect(res.tags).toEqual([]);
      expect(res.bio).toBeNull();
      expect(res.seeking.active).toBe(false);
      expect(res.seeking.text).toBeNull();
    });

    it('throws NotFoundException for unknown slug', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.getBySlug('no-such-slug')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('composes roleLine from specialty only when city is absent', async () => {
      const profile = { ...BASE_PROFILE, city: null };
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.roleLine).toBe('encre & screentone');
    });

    it('returns null roleLine when both specialty and city are absent', async () => {
      const profile = { ...BASE_PROFILE, specialty: null, city: null };
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.roleLine).toBeNull();
    });

    it('composes seeking.text when seeking is active (D3)', async () => {
      const profile = {
        ...BASE_PROFILE,
        seekingActive: true,
        seekingTargetRole: 'scénariste',
        seekingGenres: ['Seinen', 'Thriller'],
        seekingProjectLength: 'projet long',
      };
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.seeking.active).toBe(true);
      expect(res.seeking.text).toBe(
        'Cherche actuellement un·e scénariste — Seinen / Thriller, projet long',
      );
    });

    it('returns null seeking.text when seeking is inactive', async () => {
      const profile = { ...BASE_PROFILE, seekingActive: false, seekingTargetRole: 'scénariste' };
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile });

      const res = await service.getBySlug('yuki-moreau');

      expect(res.seeking.active).toBe(false);
      expect(res.seeking.text).toBeNull();
    });
  });

  // ── updateMine ───────────────────────────────────────────────────────────────

  describe('updateMine', () => {
    beforeEach(() => {
      // findUnique called after upsert to compose response
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: null });
    });

    it('upserts profile when none exists (D6)', async () => {
      const upserted = { ...BASE_PROFILE, specialty: 'manga noir' };
      prisma.profile.upsert.mockResolvedValue(upserted);
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: upserted });

      const res = await service.updateMine('acc-1', { specialty: 'manga noir' } as UpdateProfileDto);

      expect(prisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'acc-1' } }),
      );
      expect(res.specialty).toBe('manga noir');
    });

    it('updates only provided fields (partial update)', async () => {
      const upserted = { ...BASE_PROFILE, bio: 'Updated bio' };
      prisma.profile.upsert.mockResolvedValue(upserted);
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: upserted });

      const res = await service.updateMine('acc-1', { bio: 'Updated bio' } as UpdateProfileDto);

      const call = prisma.profile.upsert.mock.calls[0][0];
      expect(call.update).toHaveProperty('bio', 'Updated bio');
      expect(call.update).not.toHaveProperty('specialty');
      expect(res.bio).toBe('Updated bio');
    });

    it('de-duplicates and strips empty tags (D6 normalization)', async () => {
      const upserted = { ...BASE_PROFILE, tags: ['Seinen', 'Thriller'] };
      prisma.profile.upsert.mockResolvedValue(upserted);
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: upserted });

      await service.updateMine('acc-1', {
        tags: ['Seinen', '  ', 'Thriller', 'seinen'],
      } as UpdateProfileDto);

      const call = prisma.profile.upsert.mock.calls[0][0];
      expect(call.update.tags).toEqual(['Seinen', 'Thriller']);
    });

    it('persists seeking fields and recomposes seeking object', async () => {
      const upserted = {
        ...BASE_PROFILE,
        seekingActive: true,
        seekingTargetRole: 'scénariste',
        seekingGenres: ['Seinen'],
        seekingProjectLength: 'court',
      };
      prisma.profile.upsert.mockResolvedValue(upserted);
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: upserted });

      const res = await service.updateMine('acc-1', {
        seeking: { active: true, targetRole: 'scénariste', genres: ['Seinen'], projectLength: 'court' },
      } as UpdateProfileDto);

      expect(res.seeking.active).toBe(true);
      expect(res.seeking.targetRole).toBe('scénariste');
      expect(res.seeking.text).toBe('Cherche actuellement un·e scénariste — Seinen, court');
    });
  });

  // ── getPortfolio ─────────────────────────────────────────────────────────────

  describe('getPortfolio', () => {
    it('returns ordered portfolio items', async () => {
      const item2 = { ...PORTFOLIO_ITEM, id: 'item-2', order: 1 };
      prisma.account.findUnique.mockResolvedValue({
        ...BASE_ACCOUNT,
        profile: { ...BASE_PROFILE, portfolio: [PORTFOLIO_ITEM, item2] },
      });

      const res = await service.getPortfolio('yuki-moreau');

      expect(res).toHaveLength(2);
      expect(res[0]).toEqual({ id: 'item-1', image: PORTFOLIO_ITEM.image, caption: 'My art', order: 0 });
    });

    it('returns empty array when no profile or no items', async () => {
      prisma.account.findUnique.mockResolvedValue({ ...BASE_ACCOUNT, profile: null });

      const res = await service.getPortfolio('yuki-moreau');

      expect(res).toEqual([]);
    });

    it('throws NotFoundException for unknown slug', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      await expect(service.getPortfolio('no-such')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

// ─── UpdateProfileDto validation tests (B6) ───────────────────────────────────

describe('UpdateProfileDto validation', () => {
  it('rejects invalid seeking.targetRole', async () => {
    const dto = plainToInstance(UpdateProfileDto, { seeking: { targetRole: 'invalid-role' } }) as UpdateProfileDto;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const seekingErrors = errors.find((e) => e.property === 'seeking');
    expect(seekingErrors?.children?.length).toBeGreaterThan(0);
  });

  it('accepts null seeking.targetRole', async () => {
    const dto = plainToInstance(UpdateProfileDto, { seeking: { targetRole: null } }) as UpdateProfileDto;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts a well-formed body with all fields', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      tags: ['Seinen', 'Thriller'],
      bio: 'Ma bio',
      city: 'Paris',
      specialty: 'encre',
      seeking: {
        active: true,
        targetRole: 'scénariste',
        genres: ['Seinen'],
        projectLength: 'long',
      },
    }) as UpdateProfileDto;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts empty body (all fields optional)', async () => {
    const dto = plainToInstance(UpdateProfileDto, {}) as UpdateProfileDto;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
