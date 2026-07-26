import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PagesService, toWorkspacePage } from './pages.service';
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
  fileTags: [],
  linkedFileIds: [],
  description: null,
  dueDate: null,
  createdById: 'acc-me',
  assignees: [],
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
      chapter: { findUnique: jest.fn().mockResolvedValue({ id: 'ch-1', workId: 'work-1' }) },
      projectLabel: { findMany: jest.fn().mockResolvedValue([]) },
      pageLabel: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
      pageAssignee: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
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
    it('creates a card in a single page.create; defaults title "Page N", stage scenario, empty linkedFiles', async () => {
      prisma.page.count.mockResolvedValue(6); // 6 existing → new is "Page 7"
      const res = await service.createPage('acc-me', 'lames-de-brume', {});
      const created = prisma.page.create.mock.calls[0][0].data;
      expect(created).toMatchObject({ projectId: 'proj-1', title: 'Page 7', stage: 'scenario' });
      expect(res.stage).toBe('scenario');
      expect(res.linkedFiles).toEqual([]);
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

    it('never writes linkedFileIds or version (link state is owned by CS-3 now)', async () => {
      // linkedFileIds is gone from the DTO; a stray value must be ignored, never persisted.
      await service.updatePage('acc-me', 'page-1', { linkedFileIds: ['a', 'b'], title: 'Renommée' } as never);
      const data = prisma.page.update.mock.calls[0][0].data;
      expect(data.linkedFileIds).toBeUndefined();
      expect(data.version).toBeUndefined();
      expect(data.title).toBe('Renommée');
    });

    it('404 unknown page id', async () => {
      prisma.page.findUnique.mockResolvedValue(null);
      await expect(service.updatePage('acc-me', 'nope', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('403 non-member', async () => {
      await expect(service.updatePage('stranger', 'page-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });

    // ── CS-2 card-modal extension ─────────────────────────────────────────────
    it('writes description and dueDate (Date at UTC midnight)', async () => {
      await service.updatePage('acc-me', 'page-1', { description: 'À encrer', dueDate: '2026-08-15' });
      const data = prisma.page.update.mock.calls[0][0].data;
      expect(data.description).toBe('À encrer');
      expect((data.dueDate as Date).toISOString()).toBe('2026-08-15T00:00:00.000Z');
    });

    it('clears description and dueDate when null', async () => {
      await service.updatePage('acc-me', 'page-1', { description: null, dueDate: null });
      const data = prisma.page.update.mock.calls[0][0].data;
      expect(data.description).toBeNull();
      expect(data.dueDate).toBeNull();
    });

    it('rejects a calendar-invalid date (400)', async () => {
      await expect(service.updatePage('acc-me', 'page-1', { dueDate: '2026-13-45' })).rejects.toThrow(BadRequestException);
    });

    it('replaces the label set when every id belongs to the project', async () => {
      prisma.projectLabel.findMany.mockResolvedValue([
        { id: 'lab-1', projectId: 'proj-1' },
        { id: 'lab-2', projectId: 'proj-1' },
      ]);
      await service.updatePage('acc-me', 'page-1', { labelIds: ['lab-1', 'lab-2'] });
      expect(prisma.pageLabel.deleteMany).toHaveBeenCalledWith({ where: { pageId: 'page-1' } });
      expect(prisma.pageLabel.createMany).toHaveBeenCalledWith({
        data: [{ pageId: 'page-1', labelId: 'lab-1' }, { pageId: 'page-1', labelId: 'lab-2' }],
      });
    });

    it('rejects a labelId from another project (400 «Étiquette invalide»)', async () => {
      prisma.projectLabel.findMany.mockResolvedValue([{ id: 'lab-x', projectId: 'other' }]);
      await expect(service.updatePage('acc-me', 'page-1', { labelIds: ['lab-x'] })).rejects.toThrow(BadRequestException);
    });

    it('rejects an assigneeId who is not a project member (400 «Membre invalide»)', async () => {
      await expect(service.updatePage('acc-me', 'page-1', { assigneeIds: ['stranger'] })).rejects.toThrow(BadRequestException);
    });

    it('replaces the assignee set + notifies added and removed members (actor excluded)', async () => {
      // old = {acc-yuki}; new = {acc-me}; actor = acc-me → acc-yuki removed, acc-me added-but-actor(skip)
      prisma.page.findUnique.mockResolvedValue(PAGE({ assignees: [{ userId: 'acc-yuki' }] }));
      await service.updatePage('acc-me', 'page-1', { assigneeIds: ['acc-me'] });
      expect(prisma.pageAssignee.deleteMany).toHaveBeenCalledWith({ where: { pageId: 'page-1' } });
      // acc-yuki removed → one "retiré·e" notification; acc-me is the actor → skipped
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'acc-yuki',
          type: 'project_activity',
          refId: 'proj-1',
          sourceUserId: 'acc-me',
          message: 'Vous avez été retiré·e de « Page 1 »',
        }),
      );
    });

    it('notifies a newly-added member with the "assigné·e" message', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ assignees: [] }));
      await service.updatePage('acc-me', 'page-1', { assigneeIds: ['acc-yuki'] });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'acc-yuki', message: 'Vous avez été assigné·e à « Page 1 »' }),
      );
    });

    it('does not notify when the assignee set is unchanged', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ assignees: [{ userId: 'acc-yuki' }] }));
      await service.updatePage('acc-me', 'page-1', { assigneeIds: ['acc-yuki'] });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('swallows an assignee-notification failure', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ assignees: [] }));
      notifications.create.mockRejectedValue(new Error('notif down'));
      await expect(service.updatePage('acc-me', 'page-1', { assigneeIds: ['acc-yuki'] })).resolves.toBeDefined();
    });
  });

  // ── getDetail (GET /pages/:id) ───────────────────────────────────────────────
  describe('getDetail', () => {
    const DETAIL = (o: Record<string, unknown> = {}) => ({
      ...PAGE(),
      description: 'desc',
      dueDate: new Date('2026-08-15T00:00:00.000Z'),
      labels: [{ label: { id: 'lab-1', name: 'À revoir', color: '#e8261c' } }],
      assignees: [{ user: { id: 'acc-yuki', displayName: 'Yuki', avatar: 'y.jpg' } }],
      checklistItems: [
        { id: 'ci-1', text: 'Crayonné', done: true, order: 0 },
        { id: 'ci-2', text: 'Encrage', done: false, order: 1 },
      ],
      comments: [
        { id: 'cm-1', authorId: 'acc-me', body: 'go', createdAt: new Date('2026-08-01'), editedAt: null, author: { id: 'acc-me', displayName: 'Moi', avatar: null } },
      ],
      assetLinks: [{ asset: { id: 'as-1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 } }],
      _count: { comments: 1 },
      project: { ownerId: 'acc-me', visibility: 'prive', work: { creators: [{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }] } },
      ...o,
    });

    it('returns the full detail shape for a member (dueDate YYYY-MM-DD, ordered checklist/comments)', async () => {
      prisma.page.findUnique.mockResolvedValue(DETAIL());
      const res = await service.getDetail('acc-me', 'page-1');
      expect(res.description).toBe('desc');
      expect(res.dueDate).toBe('2026-08-15');
      expect(res.labels).toEqual([{ id: 'lab-1', name: 'À revoir', color: '#e8261c' }]);
      expect(res.assignees).toEqual([{ accountId: 'acc-yuki', displayName: 'Yuki', avatar: 'y.jpg' }]);
      expect(res.checklist).toEqual([
        { id: 'ci-1', text: 'Crayonné', done: true, order: 0 },
        { id: 'ci-2', text: 'Encrage', done: false, order: 1 },
      ]);
      expect(res.checklistDone).toBe(1);
      expect(res.checklistTotal).toBe(2);
      expect(res.commentCount).toBe(1);
      expect(res.linkedFiles).toEqual([{ assetId: 'as-1', type: 'scenario', filename: 'scenario.txt', version: 3 }]);
      expect(res.comments).toEqual([
        { id: 'cm-1', authorId: 'acc-me', authorName: 'Moi', authorAvatar: null, body: 'go', createdAt: '2026-08-01T00:00:00.000Z', editedAt: null },
      ]);
    });

    it('a non-member on a PUBLIC project can read', async () => {
      prisma.page.findUnique.mockResolvedValue(DETAIL({ project: { ownerId: 'acc-me', visibility: 'public', work: { creators: [{ accountId: 'acc-me' }] } } }));
      const res = await service.getDetail('stranger', 'page-1');
      expect(res.id).toBe('page-1');
    });

    it('a non-member on a non-public project gets 404 «Carte introuvable» (no leak)', async () => {
      prisma.page.findUnique.mockResolvedValue(DETAIL({ project: { ownerId: 'acc-me', visibility: 'prive', work: { creators: [{ accountId: 'acc-me' }] } } }));
      await expect(service.getDetail('stranger', 'page-1')).rejects.toThrow(NotFoundException);
    });

    it('404 unknown page id', async () => {
      prisma.page.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('acc-me', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ── deletePage ─────────────────────────────────────────────────────────────
  describe('deletePage', () => {
    it('deletes the page', async () => {
      await service.deletePage('acc-me', 'page-1');
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

  // ── CS-10 D-1/D-2: « Écriture » gates card writes; delete is leadership-or-author ───────────
  //
  // The gate lives in the SHARED RESOLVERS (`resolveWritableProject` / `loadWritablePage`), not in the
  // routes: a new caller that reaches for the write resolver is safe by default, and forgetting it is
  // impossible because there is nothing to forget. The read resolvers (`loadMemberPage`) stay
  // membership-only and every use of one is a deliberate, visible opt-out.
  //
  // Every pre-existing test above runs as `acc-me`, the OWNER, who short-circuits the permission check
  // on the first line — which is exactly how 81 green tests hid completely ungated asset routes (B-4).
  // These cases drive the service per caller shape and assert a refusal persists NOTHING.
  describe('CS-10 — permission gates', () => {
    const member = (accountId: string, groupRole: string, permissions: string[]) => ({ accountId, groupRole, permissions });

    const WRITER = member('acc-writer', 'member', ['ecriture', 'corrections']);
    const READER = member('acc-reader', 'member', ['corrections']); // « Écriture » explicitly OFF
    const LEADER = member('acc-lead', 'leader', []); // leadership ⇒ every permission
    const COLEADER = member('acc-co', 'coleader', []);
    const ROSTER = [member('acc-me', 'leader', []), WRITER, READER, LEADER, COLEADER];

    /** Point both resolvers at a project whose creator rows carry real group columns. */
    const withRoster = (pageOverrides: Record<string, unknown> = {}) => {
      const project = PROJECT({ work: { id: 'work-1', creators: ROSTER } });
      prisma.project.findUnique.mockResolvedValue(project);
      prisma.page.findUnique.mockResolvedValue(PAGE({ project, ...pageOverrides }));
    };

    // ── write gate: create / update / move ──────────────────────────────────
    describe.each([
      ['createPage', (a: string) => service.createPage(a, 'lames-de-brume', {})],
      ['updatePage', (a: string) => service.updatePage(a, 'page-1', { title: 'x' })],
      ['updateStage', (a: string) => service.updateStage(a, 'page-1', { stage: 'nemu' })],
    ] as [string, (a: string) => Promise<unknown>][])('%s', (_name, call) => {
      it.each([
        ['the owner', 'acc-me'],
        ['a non-owner leader', 'acc-lead'],
        ['a co-leader', 'acc-co'],
        ['a member holding « Écriture »', 'acc-writer'],
      ])('allows %s', async (_who, accountId) => {
        withRoster();
        await expect(call(accountId)).resolves.toBeDefined();
      });

      it('refuses a member WITHOUT « Écriture » (403) and persists nothing', async () => {
        withRoster();
        await expect(call('acc-reader')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.create).not.toHaveBeenCalled();
        expect(prisma.page.update).not.toHaveBeenCalled();
        expect(prisma.page.delete).not.toHaveBeenCalled();
        expect(prisma.pageLabel.createMany).not.toHaveBeenCalled();
      });

      it('refuses a non-member (403) and persists nothing', async () => {
        withRoster();
        await expect(call('acc-stranger')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.create).not.toHaveBeenCalled();
        expect(prisma.page.update).not.toHaveBeenCalled();
      });
    });

    it('createPage stamps createdById with the caller', async () => {
      withRoster();
      await service.createPage('acc-writer', 'lames-de-brume', {});
      expect(prisma.page.create.mock.calls[0][0].data).toMatchObject({ createdById: 'acc-writer' });
    });

    // ── the write resolver gates on its own — the route body does nothing ────
    it('loadWritablePage refuses without « Écriture » (the gate is in the resolver, not the route)', async () => {
      withRoster();
      await expect(service.loadWritablePage('acc-reader', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.loadWritablePage('acc-writer', 'page-1')).resolves.toBeDefined();
    });

    it('loadMemberPage stays membership-only — the read path is the deliberate opt-out', async () => {
      withRoster();
      await expect(service.loadMemberPage('acc-reader', 'page-1')).resolves.toBeDefined();
      await expect(service.loadMemberPage('acc-stranger', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    // The gate is only as good as the columns behind it — B-4 existed precisely because the select
    // omitted them, so assert the query shape, not just the behaviour.
    it('both resolvers load groupRole + permissions', async () => {
      withRoster();
      await service.createPage('acc-me', 'lames-de-brume', {});
      expect(prisma.project.findUnique.mock.calls[0][0].include.work.include.creators.select).toMatchObject({
        accountId: true,
        groupRole: true,
        permissions: true,
      });
      await service.updatePage('acc-me', 'page-1', { title: 'x' });
      expect(prisma.page.findUnique.mock.calls[0][0].include.project.include.work.include.creators.select).toMatchObject({
        accountId: true,
        groupRole: true,
        permissions: true,
      });
    });

    // ── D-1: delete = leader ∪ co-leader ∪ owner ∪ the card's author ─────────
    describe('deletePage', () => {
      it('lets a « Écriture » member delete a card THEY created', async () => {
        withRoster({ createdById: 'acc-writer' });
        await service.deletePage('acc-writer', 'page-1');
        expect(prisma.page.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
      });

      it("refuses a « Écriture » member deleting SOMEONE ELSE's card (403), deletes nothing", async () => {
        withRoster({ createdById: 'acc-co' });
        await expect(service.deletePage('acc-writer', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.delete).not.toHaveBeenCalled();
      });

      it.each([
        ['the owner', 'acc-me'],
        ['a non-owner leader', 'acc-lead'],
        // canManageProject, NOT isGroupLeader: the latter returns false for co-leaders (it exists for
        // the CS-16 project-delete gate) and would silently exclude exactly this row.
        ['a co-leader', 'acc-co'],
      ])("lets %s delete someone else's card", async (_who, accountId) => {
        withRoster({ createdById: 'acc-writer' });
        await service.deletePage(accountId, 'page-1');
        expect(prisma.page.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
      });

      it('treats a card with no recorded author as leadership-only (fails closed)', async () => {
        withRoster({ createdById: null });
        await expect(service.deletePage('acc-writer', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.delete).not.toHaveBeenCalled();
        await service.deletePage('acc-lead', 'page-1');
        expect(prisma.page.delete).toHaveBeenCalledWith({ where: { id: 'page-1' } });
      });

      it('refuses a non-member (403)', async () => {
        withRoster({ createdById: 'acc-stranger' });
        await expect(service.deletePage('acc-stranger', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.delete).not.toHaveBeenCalled();
      });
    });
  });

  // ── toWorkspacePage · derived linkedFiles (2026-07-14: via the AssetPageLink join) ───────────
  describe('toWorkspacePage linkedFiles', () => {
    it('maps the included assetLinks join to linkedFiles (version = currentVersion)', () => {
      const res = toWorkspacePage({
        ...PAGE(),
        assetLinks: [
          { asset: { id: 'as-1', type: 'scenario', filename: 'scenario.txt', currentVersion: 3 } },
          { asset: { id: 'as-2', type: 'dessin', filename: 'nemu.png', currentVersion: 2 } },
        ],
      } as never);
      expect(res.linkedFiles).toEqual([
        { assetId: 'as-1', type: 'scenario', filename: 'scenario.txt', version: 3 },
        { assetId: 'as-2', type: 'dessin', filename: 'nemu.png', version: 2 },
      ]);
    });

    it('exposes createdById so the FE can mirror the delete rule (null when unrecorded)', () => {
      expect(toWorkspacePage(PAGE() as never).createdById).toBe('acc-me');
      expect(toWorkspacePage({ ...PAGE(), createdById: null } as never).createdById).toBeNull();
    });

    it('is [] when the assetLinks join is absent or empty', () => {
      expect(toWorkspacePage(PAGE() as never).linkedFiles).toEqual([]);
      expect(toWorkspacePage({ ...PAGE(), assetLinks: [] } as never).linkedFiles).toEqual([]);
    });
  });
});
