import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SITEMAP_PAGE_SIZE } from '@encre-et-plume/shared';
import { SitemapController } from './sitemap.controller';
import { PrismaService } from '../prisma/prisma.service';

const D = (iso: string) => new Date(iso);

describe('SitemapController (F-24 BE-1)', () => {
  let controller: SitemapController;
  let prisma: {
    work: { findMany: jest.Mock };
    account: { findMany: jest.Mock };
    illustration: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      work: { findMany: jest.fn().mockResolvedValue([{ slug: 'neon-sutra', publishedAt: D('2026-01-02T00:00:00.000Z') }]) },
      account: { findMany: jest.fn().mockResolvedValue([{ profileSlug: 'yuki', createdAt: D('2026-01-03T00:00:00.000Z') }]) },
      illustration: { findMany: jest.fn().mockResolvedValue([{ id: 'ill-1', publishedAt: D('2026-01-04T00:00:00.000Z') }]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SitemapController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(SitemapController);
  });

  it('is reachable without a session — no guard on the class or the route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SitemapController)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, SitemapController.prototype.index)).toBeUndefined();
  });

  it('returns the three lists mapped to slug + lastModified', async () => {
    const res = await controller.index();

    expect(res).toEqual({
      page: 1,
      hasMore: false,
      works: [{ slug: 'neon-sutra', lastModified: '2026-01-02T00:00:00.000Z' }],
      profiles: [{ slug: 'yuki', lastModified: '2026-01-03T00:00:00.000Z' }],
      illustrations: [{ id: 'ill-1', lastModified: '2026-01-04T00:00:00.000Z' }],
    });
  });

  it('excludes unpublished works and 18+ works (D-2: the crawler gets a 403 on those)', async () => {
    await controller.index();

    expect(prisma.work.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publishedAt: { not: null }, audienceRating: { not: '18+' } },
      }),
    );
  });

  it('excludes unpublished illustrations and 18+ genres', async () => {
    await controller.index();

    const args = prisma.illustration.findMany.mock.calls[0][0];
    expect(args.where.publishedAt).toEqual({ not: null });
    expect(args.where.NOT.genres.hasSome).toEqual(expect.arrayContaining(['Hentai']));
  });

  it('excludes deleted accounts', async () => {
    await controller.index();

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });

  it('selects only the two columns it needs — no includes, no N+1', async () => {
    await controller.index();

    expect(prisma.work.findMany.mock.calls[0][0].select).toEqual({ slug: true, publishedAt: true });
    expect(prisma.account.findMany.mock.calls[0][0].select).toEqual({ profileSlug: true, createdAt: true });
    expect(prisma.illustration.findMany.mock.calls[0][0].select).toEqual({ id: true, publishedAt: true });
    for (const m of [prisma.work, prisma.account, prisma.illustration]) {
      expect(m.findMany.mock.calls[0][0].include).toBeUndefined();
    }
  });

  it('pages by id asc with a stable skip/take', async () => {
    await controller.index('3');

    for (const m of [prisma.work, prisma.account, prisma.illustration]) {
      expect(m.findMany.mock.calls[0][0]).toMatchObject({
        orderBy: { id: 'asc' },
        skip: 2 * SITEMAP_PAGE_SIZE,
        take: SITEMAP_PAGE_SIZE + 1, // one probe row → hasMore without a COUNT
      });
    }
  });

  it('flips hasMore at the page boundary and never returns the probe row', async () => {
    const full = Array.from({ length: SITEMAP_PAGE_SIZE + 1 }, (_, i) => ({
      slug: `w${i}`,
      publishedAt: D('2026-01-02T00:00:00.000Z'),
    }));
    prisma.work.findMany.mockResolvedValue(full);

    const res = await controller.index('1');

    expect(res.hasMore).toBe(true);
    expect(res.works).toHaveLength(SITEMAP_PAGE_SIZE);
  });

  it('clamps a junk or out-of-range page to 1', async () => {
    expect((await controller.index('0')).page).toBe(1);
    expect((await controller.index('abc')).page).toBe(1);
    expect((await controller.index('-4')).page).toBe(1);
  });
});
