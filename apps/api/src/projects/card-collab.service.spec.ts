import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CardCollabService } from './card-collab.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PagesService } from './pages.service';

// owner acc-me + workCreator acc-yuki
const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  title: 'Lames de Brume',
  work: { id: 'work-1', creators: [{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }] },
  ...o,
});

// what PagesService.loadMemberPage returns (membership already enforced there)
const MEMBER_PAGE = (o: Record<string, unknown> = {}) => ({
  id: 'page-1',
  projectId: 'proj-1',
  title: 'Page 1',
  project: PROJECT(),
  ...o,
});

describe('CardCollabService', () => {
  let service: CardCollabService;
  let prisma: any;
  let notifications: { create: jest.Mock };
  let pages: { loadMemberPage: jest.Mock };

  const build = () => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(PROJECT()) },
      projectLabel: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lab-1', name: 'À revoir', color: '#e8261c', project: PROJECT() }),
        findMany: jest.fn().mockResolvedValue([{ id: 'lab-1', name: 'À revoir', color: '#e8261c' }]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'lab-new', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'lab-1', name: 'x', color: '#e8261c', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      pageChecklistItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ci-1', pageId: 'page-1' }),
        findFirst: jest.fn().mockResolvedValue({ order: 2 }),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ci-new', done: false, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ci-1', text: 't', done: false, order: 0, ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      pageComment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cm-1',
          authorId: 'acc-me',
          body: 'ancien',
          pageId: 'page-1',
          page: { id: 'page-1', title: 'Page 1', projectId: 'proj-1', project: PROJECT() },
        }),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'cm-new', createdAt: new Date('2026-08-01'), editedAt: null, author: { id: data.authorId, displayName: 'Moi', avatar: null }, ...data }),
        ),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'cm-1', authorId: 'acc-me', body: 'x', createdAt: new Date('2026-08-01'), author: { id: 'acc-me', displayName: 'Moi', avatar: null }, ...data }),
        ),
        delete: jest.fn().mockResolvedValue({}),
      },
      account: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'acc-me', displayName: 'Moi' },
          { id: 'acc-yuki', displayName: 'Yuki' },
        ]),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    pages = { loadMemberPage: jest.fn().mockResolvedValue(MEMBER_PAGE()) };
    service = new CardCollabService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      pages as unknown as PagesService,
    );
  };

  beforeEach(build);

  // ── labels ───────────────────────────────────────────────────────────────
  describe('labels', () => {
    it('lists the project palette for a member', async () => {
      const res = await service.listLabels('acc-me', 'lames-de-brume');
      expect(res).toEqual([{ id: 'lab-1', name: 'À revoir', color: '#e8261c' }]);
    });

    it('lets a non-member read a PUBLIC project palette', async () => {
      prisma.project.findUnique.mockResolvedValue(PROJECT({ visibility: 'public' }));
      await expect(service.listLabels('stranger', 'lames-de-brume')).resolves.toBeDefined();
    });

    it('404s a non-member reading a PRIVATE project palette', async () => {
      await expect(service.listLabels('stranger', 'lames-de-brume')).rejects.toThrow(NotFoundException);
    });

    it('creates a label with a trimmed name + palette colour', async () => {
      const res = await service.createLabel('acc-me', 'lames-de-brume', { name: '  À encrer  ', color: '#2e7d5b' });
      expect(prisma.projectLabel.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { projectId: 'proj-1', name: 'À encrer', color: '#2e7d5b' } }),
      );
      expect(res).toEqual({ id: 'lab-new', name: 'À encrer', color: '#2e7d5b' });
    });

    it('rejects an empty name (400)', async () => {
      await expect(service.createLabel('acc-me', 'lames-de-brume', { name: '   ', color: '#2e7d5b' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a colour outside the palette (400 «Couleur invalide»)', async () => {
      await expect(service.createLabel('acc-me', 'lames-de-brume', { name: 'x', color: '#123456' })).rejects.toThrow(BadRequestException);
    });

    it('403 for a non-member creating on a PUBLIC project', async () => {
      prisma.project.findUnique.mockResolvedValue(PROJECT({ visibility: 'public' }));
      await expect(service.createLabel('stranger', 'lames-de-brume', { name: 'x', color: '#2e7d5b' })).rejects.toThrow(ForbiddenException);
    });

    it('renames/recolours an existing label (member-gated)', async () => {
      await service.updateLabel('acc-me', 'lab-1', { name: 'Corrections', color: '#3f5aa8' });
      expect(prisma.projectLabel.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lab-1' }, data: { name: 'Corrections', color: '#3f5aa8' } }),
      );
    });

    it('404 «Étiquette introuvable» on unknown label', async () => {
      prisma.projectLabel.findUnique.mockResolvedValue(null);
      await expect(service.updateLabel('acc-me', 'nope', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('rejects a bad colour on update (400)', async () => {
      await expect(service.updateLabel('acc-me', 'lab-1', { color: '#000000' })).rejects.toThrow(BadRequestException);
    });

    it('deletes a label (cascade removes it from every card)', async () => {
      await service.deleteLabel('acc-me', 'lab-1');
      expect(prisma.projectLabel.delete).toHaveBeenCalledWith({ where: { id: 'lab-1' } });
    });

    it('403 for a non-member deleting on a PUBLIC project', async () => {
      prisma.projectLabel.findUnique.mockResolvedValue({ id: 'lab-1', project: PROJECT({ visibility: 'public' }) });
      await expect(service.deleteLabel('stranger', 'lab-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── checklist ─────────────────────────────────────────────────────────────
  describe('checklist', () => {
    it('appends an item with order = max + 1 (member-gated)', async () => {
      const res = await service.addChecklistItem('acc-me', 'page-1', { text: '  Crayonné  ' });
      expect(pages.loadMemberPage).toHaveBeenCalledWith('acc-me', 'page-1');
      expect(prisma.pageChecklistItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { pageId: 'page-1', text: 'Crayonné', order: 3 } }),
      );
      expect(res).toMatchObject({ id: 'ci-new', text: 'Crayonné', done: false, order: 3 });
    });

    it('starts at order 0 for the first item', async () => {
      prisma.pageChecklistItem.findFirst.mockResolvedValue(null);
      await service.addChecklistItem('acc-me', 'page-1', { text: 'a' });
      expect(prisma.pageChecklistItem.create.mock.calls[0][0].data.order).toBe(0);
    });

    it('rejects an empty text (400)', async () => {
      await expect(service.addChecklistItem('acc-me', 'page-1', { text: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('toggles done / edits text', async () => {
      const res = await service.updateChecklistItem('acc-me', 'ci-1', { done: true });
      expect(pages.loadMemberPage).toHaveBeenCalledWith('acc-me', 'page-1');
      expect(prisma.pageChecklistItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ci-1' }, data: { done: true } }));
      expect(res.done).toBe(true);
    });

    it('404 «Élément introuvable» on unknown item', async () => {
      prisma.pageChecklistItem.findUnique.mockResolvedValue(null);
      await expect(service.updateChecklistItem('acc-me', 'nope', { done: true })).rejects.toThrow(NotFoundException);
    });

    it('deletes an item (member-gated)', async () => {
      await service.deleteChecklistItem('acc-me', 'ci-1');
      expect(prisma.pageChecklistItem.delete).toHaveBeenCalledWith({ where: { id: 'ci-1' } });
    });
  });

  // ── comments ────────────────────────────────────────────────────────────────
  describe('comments', () => {
    it('creates a comment authored by the session user', async () => {
      const res = await service.addComment('acc-me', 'page-1', { body: '  À revoir la case 3  ' });
      expect(prisma.pageComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pageId: 'page-1', authorId: 'acc-me', body: 'À revoir la case 3' }) }),
      );
      expect(res).toMatchObject({ id: 'cm-new', authorId: 'acc-me', authorName: 'Moi', body: 'À revoir la case 3', editedAt: null });
    });

    it('rejects an empty body (400)', async () => {
      await expect(service.addComment('acc-me', 'page-1', { body: '   ' })).rejects.toThrow(BadRequestException);
    });

    it('notifies each @name-mentioned member (type mention, correct message, actor excluded)', async () => {
      await service.addComment('acc-me', 'page-1', { body: 'Hey @Yuki regarde ça' });
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'acc-yuki',
          type: 'mention',
          refId: 'proj-1',
          sourceUserId: 'acc-me',
          message: 'Vous avez été mentionné·e sur « Page 1 »',
        }),
      );
    });

    it('mention matching is case-insensitive and excludes the author', async () => {
      await service.addComment('acc-me', 'page-1', { body: '@moi @yUkI' });
      // acc-me is the author → skipped; acc-yuki matched once
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create.mock.calls[0][0].recipientId).toBe('acc-yuki');
    });

    it('does not fire on a prefix collision or an email-style @ (tightened matching)', async () => {
      // "@Yukion" has Yuki as a prefix; "vince@Yuki.fr" has @ after a word char — neither is a mention.
      await service.addComment('acc-me', 'page-1', { body: 'salut @Yukion et vince@Yuki.fr' });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('matches a mention terminated by punctuation', async () => {
      await service.addComment('acc-me', 'page-1', { body: 'merci @Yuki !' });
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('swallows a mention-notification failure (never fails the comment)', async () => {
      notifications.create.mockRejectedValue(new Error('notif down'));
      await expect(service.addComment('acc-me', 'page-1', { body: '@Yuki' })).resolves.toBeDefined();
    });

    it('edits own comment: sets editedAt + notifies only newly-added mentions', async () => {
      // old body had no mention; new body mentions Yuki → one notification
      const res = await service.updateComment('acc-me', 'cm-1', { body: '@Yuki relis' });
      expect(prisma.pageComment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cm-1' }, data: expect.objectContaining({ body: '@Yuki relis', editedAt: expect.any(Date) }) }),
      );
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(res.id).toBe('cm-1');
    });

    it('does NOT re-notify a mention that was already in the old body', async () => {
      prisma.pageComment.findUnique.mockResolvedValue({
        id: 'cm-1', authorId: 'acc-me', body: '@Yuki déjà',
        pageId: 'page-1', page: { id: 'page-1', title: 'Page 1', projectId: 'proj-1', project: PROJECT() },
      });
      await service.updateComment('acc-me', 'cm-1', { body: '@Yuki déjà et encore' });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('403 «author only» when a non-author edits', async () => {
      await expect(service.updateComment('acc-yuki', 'cm-1', { body: 'x' })).rejects.toThrow(ForbiddenException);
    });

    it('404 «Commentaire introuvable» on unknown comment', async () => {
      prisma.pageComment.findUnique.mockResolvedValue(null);
      await expect(service.updateComment('acc-me', 'nope', { body: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('author deletes own comment', async () => {
      await service.deleteComment('acc-me', 'cm-1');
      expect(prisma.pageComment.delete).toHaveBeenCalledWith({ where: { id: 'cm-1' } });
    });

    it('project owner deletes any comment', async () => {
      prisma.pageComment.findUnique.mockResolvedValue({
        id: 'cm-1', authorId: 'acc-yuki', body: 'x',
        pageId: 'page-1', page: { id: 'page-1', title: 'Page 1', projectId: 'proj-1', project: PROJECT() },
      });
      await service.deleteComment('acc-me', 'cm-1'); // acc-me is the project owner
      expect(prisma.pageComment.delete).toHaveBeenCalled();
    });

    it('403 when a non-author non-owner member deletes', async () => {
      prisma.pageComment.findUnique.mockResolvedValue({
        id: 'cm-1', authorId: 'acc-me', body: 'x',
        pageId: 'page-1', page: { id: 'page-1', title: 'Page 1', projectId: 'proj-1', project: PROJECT() },
      });
      await expect(service.deleteComment('acc-yuki', 'cm-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
