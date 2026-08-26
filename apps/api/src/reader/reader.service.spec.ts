import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PROSE_PARAGRAPHS_PER_PAGE } from '@encre-et-plume/shared';
import { ReaderService } from './reader.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { RedisService } from '../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';

const WORK_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'w1',
  slug: 'lames-de-brume',
  format: 'Manga',
  audienceRating: 'Tous publics',
  publishedAt: new Date('2026-01-01'),
  ...overrides,
});

const CHAPTER_ROW = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'c1',
  workId: 'w1',
  number: 1,
  premium: false,
  prose: null,
  ...overrides,
});

describe('ReaderService', () => {
  let service: ReaderService;
  let prisma: {
    work: { findFirst: jest.Mock; update: jest.Mock };
    chapter: { findFirst: jest.Mock };
    planche: { findMany: jest.Mock };
  };
  let ageGate: { assertMayView18Plus: jest.Mock };
  let redis: { setNx: jest.Mock };
  let analytics: { track: jest.Mock; visitorId: jest.Mock };

  beforeEach(() => {
    prisma = {
      work: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(undefined) },
      chapter: { findFirst: jest.fn().mockResolvedValue(null) },
      planche: { findMany: jest.fn().mockResolvedValue([]) },
    };
    ageGate = { assertMayView18Plus: jest.fn().mockResolvedValue(undefined) };
    // F-23: a fresh visitor by default — first open in the window.
    redis = { setNx: jest.fn().mockResolvedValue(true) };
    analytics = {
      track: jest.fn().mockResolvedValue(undefined),
      visitorId: jest.fn().mockResolvedValue('00000000-0000-8000-8000-000000000001'),
    };
    service = new ReaderService(
      prisma as unknown as PrismaService,
      ageGate as unknown as AgeGateService,
      redis as unknown as RedisService,
      analytics as unknown as AnalyticsService,
    );
  });

  it('throws 404 when the work is missing/unpublished', async () => {
    prisma.work.findFirst.mockResolvedValue(null);

    await expect(service.getPages('inconnu', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('throws 404 when the chapter number is missing', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(null);

    await expect(service.getPages('lames-de-brume', 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('throws 403 with reason "premium" for a locked chapter and does not increment readCount', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW({ premium: true }));

    await expect(service.getPages('lames-de-brume', 4)).rejects.toMatchObject({
      response: expect.objectContaining({ statusCode: 403, message: 'Chapitre verrouillé', reason: 'premium' }),
    });
    await expect(service.getPages('lames-de-brume', 4)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.work.update).not.toHaveBeenCalled();
  });

  it('builds a manga payload: ordered pages, totalPages = pages.length, readMode "pages"', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Manga' }));
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());
    prisma.planche.findMany.mockResolvedValue([
      { id: 'p1', image: 'a.jpg', caption: null, order: 0 },
      { id: 'p2', image: null, caption: 'Bulle', order: 1 },
    ]);

    const result = await service.getPages('lames-de-brume', 1);

    expect(prisma.planche.findMany).toHaveBeenCalledWith({ where: { chapterId: 'c1' }, orderBy: { order: 'asc' } });
    expect(result).toEqual({
      workSlug: 'lames-de-brume',
      chapterNumber: 1,
      readMode: 'pages',
      totalPages: 2,
      pages: [
        { index: 1, image: 'a.jpg', caption: null, double: false },
        { index: 2, image: null, caption: 'Bulle', double: false },
      ],
      prose: [],
    });
  });

  it('builds a roman payload: splits prose on "\\n\\n", totalPages via the shared constant, readMode "prose"', async () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i + 1}`);
    prisma.work.findFirst.mockResolvedValue(WORK_ROW({ format: 'Roman' }));
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW({ prose: paragraphs.join('\n\n') }));

    const result = await service.getPages('le-murmure', 1);

    expect(prisma.planche.findMany).not.toHaveBeenCalled();
    expect(result.readMode).toBe('prose');
    expect(result.pages).toEqual([]);
    expect(result.prose).toEqual(paragraphs);
    expect(result.totalPages).toBe(Math.ceil(paragraphs.length / PROSE_PARAGRAPHS_PER_PAGE));
  });

  it('increments Work.readCount by 1 on a successful accessible fetch', async () => {
    prisma.work.findFirst.mockResolvedValue(WORK_ROW());
    prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());

    await service.getPages('lames-de-brume', 1);

    expect(prisma.work.update).toHaveBeenCalledTimes(1);
    expect(prisma.work.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { readCount: { increment: 1 } } });
  });

  // ── DR-10 BE-6: 18+ age gate ────────────────────────────────────────────────

  describe('DR-10: 18+ age gate', () => {
    it('does not call the age gate for a non-18+ work', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ audienceRating: 'Tous publics' }));
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());

      await service.getPages('lames-de-brume', 1, 'acc-1');

      expect(ageGate.assertMayView18Plus).not.toHaveBeenCalled();
    });

    it('calls the age gate with the accountId for an 18+ work', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ audienceRating: '18+' }));
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());

      await service.getPages('lames-de-brume', 1, 'acc-1');

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1', undefined);
    });

    it('runs the age gate BEFORE the premium check and BEFORE the readCount bump', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ audienceRating: '18+' }));
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW({ premium: true }));
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));

      await expect(service.getPages('lames-de-brume', 1, 'acc-minor')).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'AGE_RESTRICTED' }),
      });
      expect(prisma.work.update).not.toHaveBeenCalled();
    });

    it('propagates the 403 AGE_RESTRICTED thrown by the age gate for a logged-in minor', async () => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW({ audienceRating: '18+' }));
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));

      await expect(service.getPages('lames-de-brume', 1, 'acc-minor')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.work.update).not.toHaveBeenCalled();
    });
  });

  // ── F-23 B10 · read event + the readCount inflation fix ────────────────────

  describe('read dedupe (F-23 B10)', () => {
    const CLIENT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' };

    beforeEach(() => {
      prisma.work.findFirst.mockResolvedValue(WORK_ROW());
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER_ROW());
    });

    it('first open in the window · bumps readCount AND emits one read event', async () => {
      await service.getPages('lames-de-brume', 1, undefined, CLIENT);

      expect(redis.setNx).toHaveBeenCalledWith(
        'read:00000000-0000-8000-8000-000000000001:c1',
        '1',
        1800,
      );
      expect(prisma.work.update).toHaveBeenCalledTimes(1);
      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'read', targetType: 'work', targetId: 'w1' }),
      );
    });

    it('second open within 30 min · does NEITHER — the counter no longer inflates on refresh', async () => {
      redis.setNx.mockResolvedValue(false);

      await service.getPages('lames-de-brume', 1, undefined, CLIENT);

      expect(prisma.work.update).not.toHaveBeenCalled();
      expect(analytics.track).not.toHaveBeenCalled();
    });

    it('attributes the read to the signed-in account', async () => {
      await service.getPages('lames-de-brume', 1, 'acc-1', CLIENT);

      expect(analytics.track).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }));
    });

    it('no visitorId (Redis down) · keeps today\'s behaviour — bump, no event, no dedupe', async () => {
      analytics.visitorId.mockResolvedValue(null);

      await service.getPages('lames-de-brume', 1, undefined, CLIENT);

      expect(redis.setNx).not.toHaveBeenCalled();
      expect(prisma.work.update).toHaveBeenCalledTimes(1);
      expect(analytics.track).not.toHaveBeenCalled();
    });

    it('never puts the IP in the dedupe key', async () => {
      await service.getPages('lames-de-brume', 1, undefined, CLIENT);

      expect(redis.setNx.mock.calls[0][0]).not.toContain('203.0.113.7');
    });
  });
});