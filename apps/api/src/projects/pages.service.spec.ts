import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PagesService } from './pages.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// A project row as loaded for membership checks: owner acc-me + workCreator acc-yuki.
const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: { id: 'work-1', creators: [{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }] },
  ...o,
});

const PAGE = (o: Record<string, unknown> = {}) => ({
  id: 'page-1',
  projectId: 'proj-1',
  chapterId: null,
  title: 'Page 1',
  stage: 'scenario',
  version: 1,
  fileTags: [],
  linkedFileIds: [],
  project: PROJECT(),
  ...o,
});

describe('PagesService', () => {
  let service: PagesService;
  let prisma: any;
  let notifications: { create: jest.Mock };

  const build = () => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(PROJECT()) },
      page: {
        findUnique: jest.fn().mockResolvedValue(PAGE()),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...PAGE(), ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...PAGE(), ...data })),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      pageVersion: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      chapter: { findUnique: jest.fn().mockResolvedValue({ id: 'ch-1', workId: 'work-1' }) },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    service = new PagesService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  };

  beforeEach(build);

  // ── createPage ─────────────────────────────────────────────────────────────
  describe('createPage', () => {
    it('creates a card with a v1 PageVersion row in one transaction; defaults title "Page N", stage scenario', async () => {
      prisma.page.count.mockResolvedValue(6); // 6 existing → new is "Page 7"
      const res = await service.createPage('acc-me', 'lames-de-brume', {});
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const created = prisma.page.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ projectId: 'proj-1', title: 'Page 7', stage: 'scenario' });
      expect(prisma.pageVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1, note: 'Création' }) }),
      );
      expect(res.stage).toBe('scenario');
      expect(res.version).toBe(1);
    });

    it('uses the caller stage/title/chapterId when supplied', async () => {
      const res = await service.createPage('acc-me', 'lames-de-brume', { stage: 'encrage', title: 'Couverture', chapterId: 'ch-1' });
      expect(prisma.page.create.mock.calls[0][0].data).toMatchObject({ stage: 'encrage', title: 'Couverture', chapterId: 'ch-1' });
      expect(res.stage).toBe('encrage');
    });

    it('rejects an unknown stage (400)', async () => {
      await expect(service.createPage('acc-me', 'lames-de-brume', { stage: 'bogus' as never })).rejects.toThrow(BadRequestException);
    });

    it('rejects a chapterId that does not belong to the project work (400)', async () => {
      prisma.chapter.findUnique.mockResolvedValue({ id: 'ch-x', workId: 'other-work' });
      await expect(service.createPage('acc-me', 'lames-de-brume', { chapterId: 'ch-x' })).rejects.toThrow(BadRequestException);
    });

    it('404 on unknown slug', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(service.createPage('acc-me', 'nope', {})).rejects.toThrow(NotFoundException);
    });

    it('403 for a non-member', async () => {
      await expect(service.createPage('stranger', 'lames-de-brume', {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ── updatePage ─────────────────────────────────────────────────────────────
  describe('updatePage', () => {
    it('validates fileTags ⊆ PAGE_FILE_TAGS (400 otherwise)', async () => {
      await expect(service.updatePage('acc-me', 'page-1', { fileTags: ['scenario', 'bad'] as never })).rejects.toThrow(BadRequestException);
    });

    it('bumps version + appends a PageVersion when linkedFileIds changes', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ version: 3, linkedFileIds: ['a'] }));
      await service.updatePage('acc-me', 'page-1', { linkedFileIds: ['a', 'b'] });
      expect(prisma.page.update.mock.calls[0][0].data).toMatchObject({ version: 4, linkedFileIds: ['a', 'b'] });
      expect(prisma.pageVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 4, note: 'Nouvelle révision de fichier' }) }),
      );
    });

    it('does NOT bump version when linkedFileIds is unchanged', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ version: 3, linkedFileIds: ['a', 'b'] }));
      await service.updatePage('acc-me', 'page-1', { linkedFileIds: ['a', 'b'], title: 'Renommée' });
      expect(prisma.page.update.mock.calls[0][0].data.version).toBeUndefined();
      expect(prisma.pageVersion.create).not.toHaveBeenCalled();
    });

    it('404 unknown page id', async () => {
      prisma.page.findUnique.mockResolvedValue(null);
      await expect(service.updatePage('acc-me', 'nope', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('403 non-member', async () => {
      await expect(service.updatePage('stranger', 'page-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });
  });

  // ── deletePage ─────────────────────────────────────────────────────────────
  describe('deletePage', () => {
    it('deletes the page and its versions in one transaction', async () => {
      await service.deletePage('acc-me', 'page-1');
      expect(prisma.pageVersion.deleteMany).toHaveBeenCalledWith({ where: { pageId: 'page-1' } });
      expect(prisma.page.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
    });

    it('403 non-member', async () => {
      await expect(service.deletePage('stranger', 'page-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── updateStage ────────────────────────────────────────────────────────────
  describe('updateStage', () => {
    it('rejects an unknown stage (400)', async () => {
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'bogus' as never })).rejects.toThrow(BadRequestException);
    });

    it('persists the new stage', async () => {
      const res = await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
      expect(prisma.page.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'page-1' }, data: { stage: 'nemu' } }));
      expect(res.stage).toBe('nemu');
    });

    it('stage→corrections notifies every member except the actor with project_activity', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'nemu' }));
      await service.updateStage('acc-me', 'page-1', { stage: 'corrections' });
      // owner acc-me is the actor → only acc-yuki notified
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith({
        recipientId: 'acc-yuki',
        type: 'project_activity',
        refId: 'proj-1',
        sourceUserId: 'acc-me',
      });
    });

    it('does not notify when the stage was already corrections', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'corrections' }));
      await service.updateStage('acc-me', 'page-1', { stage: 'corrections' });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not notify for a non-corrections stage change', async () => {
      await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('swallows a notification failure (never fails the request)', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'nemu' }));
      notifications.create.mockRejectedValue(new Error('notif down'));
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'corrections' })).resolves.toMatchObject({ stage: 'corrections' });
    });
  });

  // ── getVersions ────────────────────────────────────────────────────────────
  describe('getVersions', () => {
    it('returns PageVersion rows newest-first, member-gated', async () => {
      prisma.pageVersion.findMany.mockResolvedValue([
        { version: 2, note: 'Nouvelle révision de fichier', createdAt: new Date('2024-02-01') },
        { version: 1, note: 'Création', createdAt: new Date('2024-01-01') },
      ]);
      const res = await service.getVersions('acc-me', 'page-1');
      expect(prisma.pageVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { pageId: 'page-1' }, orderBy: { version: 'desc' } }),
      );
      expect(res).toEqual([
        { version: 2, note: 'Nouvelle révision de fichier', createdAt: '2024-02-01T00:00:00.000Z' },
        { version: 1, note: 'Création', createdAt: '2024-01-01T00:00:00.000Z' },
      ]);
    });

    it('403 non-member', async () => {
      await expect(service.getVersions('stranger', 'page-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
