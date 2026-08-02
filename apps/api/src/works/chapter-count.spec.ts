import { syncWorkChapterCount } from './chapter-count';

describe('syncWorkChapterCount', () => {
  let prisma: { chapter: { count: jest.Mock }; work: { update: jest.Mock } };

  beforeEach(() => {
    prisma = { chapter: { count: jest.fn().mockResolvedValue(0) }, work: { update: jest.fn() } };
  });

  it('counts ONLY chapters that are published AND already due — the same rule the œuvre page reads', async () => {
    await syncWorkChapterCount(prisma as never, 'work-1');

    const where = prisma.chapter.count.mock.calls[0][0].where;
    expect(where.workId).toBe('work-1');
    expect(where.status).toBe('published');
    expect(where.publishAt.lte).toBeInstanceOf(Date);
  });

  it('writes the counted value onto the work and returns it', async () => {
    prisma.chapter.count.mockResolvedValue(12);

    const count = await syncWorkChapterCount(prisma as never, 'work-1');

    expect(count).toBe(12);
    expect(prisma.work.update).toHaveBeenCalledWith({ where: { id: 'work-1' }, data: { chapterCount: 12 } });
  });

  it('writes 0 rather than leaving a stale advertised count behind', async () => {
    prisma.chapter.count.mockResolvedValue(0);

    await syncWorkChapterCount(prisma as never, 'work-1');

    expect(prisma.work.update).toHaveBeenCalledWith({ where: { id: 'work-1' }, data: { chapterCount: 0 } });
  });
});
