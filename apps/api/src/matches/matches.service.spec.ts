import { MatchesService } from './matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// A candidate Profile row as selected by the service (see CANDIDATE_SELECT).
const CANDIDATE = (overrides: Partial<Record<string, unknown>> = {}) => ({
  accountId: 'acc-theo',
  tags: ['Seinen', 'Encre dense'],
  seekingGenres: [],
  seekingProjectLength: 'projet long',
  creatorRoles: ['dessinateur'],
  trendingScore: 90,
  createdAt: new Date('2024-01-01'),
  account: { profileSlug: 'mc1-theo-m', displayName: 'Théo M.', avatar: null },
  ...overrides,
});

// The viewer's own Profile row (profile.findUnique).
const VIEWER = (overrides: Partial<Record<string, unknown>> = {}) => ({
  tags: ['Seinen', 'Ambiances urbaines'],
  seekingGenres: [],
  seekingProjectLength: 'projet long',
  seekingTargetRole: 'dessinateur',
  creatorRoles: ['scenariste'],
  ...overrides,
});

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: {
    profile: { findUnique: jest.Mock; findMany: jest.Mock };
    connection: { findMany: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue(VIEWER()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      connection: { findMany: jest.fn().mockResolvedValue([]) },
    };
    redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    service = new MatchesService(prisma as unknown as PrismaService, redis as unknown as RedisService);
  });

  describe('minimum-data guard', () => {
    it('returns an empty incompleteProfile result and does not query candidates when the viewer has no genre/style tags', async () => {
      prisma.profile.findUnique.mockResolvedValue(VIEWER({ tags: [], seekingGenres: [] }));
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res).toEqual({ items: [], incompleteProfile: true });
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });

    it('treats a missing viewer profile as incomplete', async () => {
      prisma.profile.findUnique.mockResolvedValue(null);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res).toEqual({ items: [], incompleteProfile: true });
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });
  });

  describe('candidate query', () => {
    it('excludes the viewer, tombstoned accounts, and non-creators, ordered trending then oldest, bounded scan', async () => {
      await service.getSuggestions('viewer-1', 4);
      const args = prisma.profile.findMany.mock.calls[0][0];
      expect(args.where.accountId).toEqual({ notIn: ['viewer-1'] });
      expect(args.where.account).toEqual({ deletedAt: null });
      expect(args.where.NOT).toEqual({ creatorRoles: { isEmpty: true } });
      expect(args.orderBy).toEqual([{ trendingScore: 'desc' }, { createdAt: 'asc' }]);
      expect(args.take).toBe(200);
    });

    it('excludes accounts already connected or with a pending request (MC-8, either direction)', async () => {
      prisma.connection.findMany.mockResolvedValue([
        { requesterId: 'viewer-1', addresseeId: 'acc-connected' },
        { requesterId: 'acc-pending', addresseeId: 'viewer-1' },
      ]);
      await service.getSuggestions('viewer-1', 4);
      const args = prisma.profile.findMany.mock.calls[0][0];
      expect(new Set(args.where.accountId.notIn)).toEqual(new Set(['viewer-1', 'acc-connected', 'acc-pending']));
      // only non-declined pairs feed the exclusion
      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { in: ['pending', 'accepted'] } }) }),
      );
    });
  });

  describe('scoring', () => {
    it('scores a full genre + rhythm + role match and names the top two reasons', async () => {
      prisma.profile.findMany.mockResolvedValue([CANDIDATE()]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.incompleteProfile).toBe(false);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toEqual({
        userId: 'acc-theo',
        slug: 'mc1-theo-m',
        name: 'Théo M.',
        avatarUrl: null,
        role: 'dessinateur',
        genre: 'Seinen',
        affinityScore: 75, // 40 genre + 15 rhythm + 20 role
        reason: 'même genre · rythme compatible',
      });
    });

    it('scores a style-only match (case/accent-insensitive) with the style reason', async () => {
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({
          accountId: 'acc-noe',
          tags: ['Romance', 'ambiances URBAINES'],
          seekingProjectLength: null,
          creatorRoles: ['scenariste'],
          account: { profileSlug: 'mc1-noe-p', displayName: 'Noé P.', avatar: null },
        }),
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items[0].affinityScore).toBe(25); // 25 style only, no rhythm, no role
      expect(res.items[0].reason).toBe('style proche de vos refs');
      expect(res.items[0].genre).toBe('Romance'); // no shared genre → candidate's first genre tag
    });

    it('applies the rhythm bonus only when both sides declare the same project length', async () => {
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ seekingProjectLength: 'one-shot', creatorRoles: ['scenariste'] }),
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items[0].affinityScore).toBe(40); // genre only; role no (scenariste), rhythm mismatch
      expect(res.items[0].reason).toBe('même genre');
    });

    it('derives the preferred role from the complement of the viewer creatorRoles when no target role is set', async () => {
      prisma.profile.findUnique.mockResolvedValue(
        VIEWER({ seekingTargetRole: null, creatorRoles: ['scenariste'] }),
      );
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ seekingProjectLength: null }), // dessinateur = complement of scenariste
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items[0].affinityScore).toBe(60); // 40 genre + 20 role (complement)
      expect(res.items[0].reason).toBe('même genre · rôle complémentaire');
    });

    it('excludes candidates whose only overlap is a rhythm/role bonus (no shared genre/style)', async () => {
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ tags: ['Aquarelle'], seekingProjectLength: 'projet long', creatorRoles: ['dessinateur'] }),
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items).toEqual([]);
    });

    it('clamps the score at 100', async () => {
      prisma.profile.findUnique.mockResolvedValue(
        VIEWER({ tags: ['Seinen', 'Thriller', 'Ambiances urbaines'], seekingGenres: [] }),
      );
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ tags: ['Seinen', 'Thriller', 'Ambiances urbaines'] }),
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items[0].affinityScore).toBeLessThanOrEqual(100);
    });

    it('ranks a high-overlap same-role candidate above a low-overlap complementary-role one (soft preference)', async () => {
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ // complementary role (dessinateur) but low overlap: style only
          accountId: 'acc-low',
          tags: ['Aquarelle', 'Ambiances urbaines'],
          seekingProjectLength: null,
          creatorRoles: ['dessinateur'],
          account: { profileSlug: 'low', displayName: 'Low', avatar: null },
        }),
        CANDIDATE({ // same role (scenariste) but high overlap: genre + rhythm
          accountId: 'acc-high',
          tags: ['Seinen'],
          seekingProjectLength: 'projet long',
          creatorRoles: ['scenariste'],
          account: { profileSlug: 'high', displayName: 'High', avatar: null },
        }),
      ]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items.map((i) => i.userId)).toEqual(['acc-high', 'acc-low']);
    });
  });

  describe('ordering, limit, mapping', () => {
    it('orders by score desc then trendingScore desc then createdAt asc, and slices to the limit', async () => {
      prisma.profile.findMany.mockResolvedValue([
        CANDIDATE({ accountId: 'a', tags: ['Seinen'], seekingProjectLength: null, creatorRoles: ['scenariste'], trendingScore: 10, createdAt: new Date('2024-03-01'), account: { profileSlug: 'a', displayName: 'A', avatar: null } }),
        CANDIDATE({ accountId: 'b', tags: ['Seinen'], seekingProjectLength: null, creatorRoles: ['scenariste'], trendingScore: 50, createdAt: new Date('2024-02-01'), account: { profileSlug: 'b', displayName: 'B', avatar: null } }),
        CANDIDATE({ accountId: 'c', tags: ['Seinen'], seekingProjectLength: null, creatorRoles: ['scenariste'], trendingScore: 50, createdAt: new Date('2024-01-01'), account: { profileSlug: 'c', displayName: 'C', avatar: null } }),
      ]);
      const res = await service.getSuggestions('viewer-1', 2);
      // all score 40; tie-break trendingScore desc (b,c) then createdAt asc (c before b)
      expect(res.items.map((i) => i.userId)).toEqual(['c', 'b']);
    });

    it('passes avatarUrl through as null', async () => {
      prisma.profile.findMany.mockResolvedValue([CANDIDATE({ account: { profileSlug: 's', displayName: 'N', avatar: null } })]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items[0].avatarUrl).toBeNull();
    });
  });

  describe('redis cache (fail-open, 60s per viewer)', () => {
    it('serves a cache hit without querying the database', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ items: [], incompleteProfile: false }));
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res).toEqual({ items: [], incompleteProfile: false });
      expect(prisma.profile.findUnique).not.toHaveBeenCalled();
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });

    it('writes the computed result under a per-viewer key with a 60s TTL', async () => {
      await service.getSuggestions('viewer-9', 4);
      expect(redis.set).toHaveBeenCalledWith('matches:sugg:viewer-9:4', expect.any(String), 'EX', 60);
    });

    it('fails open: a Redis get error falls through to a fresh compute', async () => {
      redis.get.mockResolvedValue(null); // RedisService.get already swallows to null
      prisma.profile.findMany.mockResolvedValue([CANDIDATE()]);
      const res = await service.getSuggestions('viewer-1', 4);
      expect(res.items).toHaveLength(1);
    });
  });
});
