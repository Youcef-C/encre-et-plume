import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  // CS-20 — no handoff pin by default (older cards, and every card before it leaves Scénario).
  drawnAgainstAssetId: null,
  drawnAgainstVersion: null,
  drawnAgainstAsset: null,
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
        findMany: jest.fn().mockResolvedValue([]),
      },
      chapter: { findUnique: jest.fn().mockResolvedValue({ id: 'ch-1', workId: 'work-1' }) },
      // CS-20 reads nothing extra: the stamp and the acknowledge both come off the resolver's own
      // include, so this stub deliberately exposes NO `asset` model — a per-write lookup would throw.

      correction: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
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
      const res = await service.createPage('acc-me', 'lames-de-brume', { chapterId: 'ch-1' });
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
      await expect(service.createPage('acc-me', 'lames-de-brume', { stage: 'bogus' as never, chapterId: 'ch-1' })).rejects.toThrow(BadRequestException);
    });

    // R2-1 (user rule 2026-07-31) — deliberate change to the shipped CS-2 create contract.
    it('rejects a create with no chapter (400) — a chapter is a prerequisite for a card', async () => {
      await expect(service.createPage('acc-me', 'lames-de-brume', {})).rejects.toThrow(BadRequestException);
      await expect(service.createPage('acc-me', 'lames-de-brume', { chapterId: null })).rejects.toThrow(BadRequestException);
      expect(prisma.page.create).not.toHaveBeenCalled();
    });

    // The rule is create-time only: `Page.chapterId` stays nullable so chapter deletion can orphan.
    it('leaves existing null-chapter rows readable and updatable', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ chapterId: null }));
      await expect(service.updatePage('acc-me', 'page-1', { title: 'Toujours là' })).resolves.toMatchObject({
        title: 'Toujours là',
      });
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

    // R8-1 — a new card always lands LAST in its chapter. Positions stay dense (0..n-1), so the
    // existing card count IS the next slot; no second query.
    it('appends the new card at the end of the chapter (position = card count)', async () => {
      prisma.page.count.mockResolvedValue(6);
      await service.createPage('acc-me', 'lames-de-brume', { chapterId: 'ch-1' });
      expect(prisma.page.create.mock.calls[0][0].data.position).toBe(6);
    });

    it('gives the first card of a chapter position 0', async () => {
      prisma.page.count.mockResolvedValue(0);
      await service.createPage('acc-me', 'lames-de-brume', { chapterId: 'ch-1', title: 'Couverture' });
      expect(prisma.page.create.mock.calls[0][0].data.position).toBe(0);
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

    // ── R2-5 — move a card between chapters (the only move there is: a card always has one) ──
    it('moves the card to another chapter of the same project', async () => {
      prisma.chapter.findUnique.mockResolvedValue({ id: 'ch-2', workId: 'work-1' });
      await service.updatePage('acc-me', 'page-1', { chapterId: 'ch-2' });
      expect(prisma.page.update.mock.calls[0][0].data.chapterId).toBe('ch-2');
    });

    it('rejects a chapter belonging to another project (400) — a card never crosses projects', async () => {
      prisma.chapter.findUnique.mockResolvedValue({ id: 'ch-x', workId: 'other-work' });
      await expect(service.updatePage('acc-me', 'page-1', { chapterId: 'ch-x' })).rejects.toThrow(BadRequestException);
      expect(prisma.page.update).not.toHaveBeenCalled();
    });

    // R2-5c: under R2-1 a card always belongs somewhere — moving back to "no chapter" is not a move.
    it('rejects clearing the chapter (400)', async () => {
      await expect(service.updatePage('acc-me', 'page-1', { chapterId: null })).rejects.toThrow(BadRequestException);
      expect(prisma.page.update).not.toHaveBeenCalled();
    });

    it('403 non-member', async () => {
      await expect(service.updatePage('stranger', 'page-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });

    // ── R8-1 — PLACEMENT: the ONE write path for both the strip's drag and the modal's field ──
    describe('position', () => {
      // 4 cards in ch-1, the edited one (page-1) sitting third.
      const siblings = (ids = ['a', 'b', 'page-1', 'c']) =>
        prisma.page.findMany.mockResolvedValue(ids.map((id, position) => ({ id, position })));
      /** Every position write the service made, as `{ id: position }`. */
      const written = () =>
        Object.fromEntries(
          prisma.page.update.mock.calls
            .filter((c: any) => c[0].data.position !== undefined)
            .map((c: any) => [c[0].where.id, c[0].data.position]),
        );

      it('moves the card to the requested 1-based slot and renumbers the chapter densely', async () => {
        siblings();
        await service.updatePage('acc-me', 'page-1', { position: 1 });
        // page-1 jumps to the front: a and b each shift down one; c never moves.
        expect(written()).toEqual({ 'page-1': 0, a: 1, b: 2 });
      });

      it('moves a card DOWN the chapter', async () => {
        siblings();
        await service.updatePage('acc-me', 'page-1', { position: 4 });
        expect(written()).toEqual({ 'page-1': 3, c: 2 });
      });

      it('only writes the siblings whose slot actually changed', async () => {
        siblings();
        await service.updatePage('acc-me', 'page-1', { position: 3 }); // already there
        expect(written()).toEqual({ 'page-1': 2 });
      });

      it('clamps an out-of-range slot instead of leaving a gap', async () => {
        siblings();
        await service.updatePage('acc-me', 'page-1', { position: 99 });
        expect(written()).toEqual({ 'page-1': 3, c: 2 });
      });

      it('places the card in the DESTINATION chapter when the move carries a slot', async () => {
        prisma.chapter.findUnique.mockResolvedValue({ id: 'ch-2', workId: 'work-1' });
        siblings(['x', 'y']); // ch-2 already holds two cards
        await service.updatePage('acc-me', 'page-1', { chapterId: 'ch-2', position: 1 });
        expect(prisma.page.findMany.mock.calls[0][0].where.chapterId).toBe('ch-2');
        expect(written()).toEqual({ 'page-1': 0, x: 1, y: 2 });
      });

      it('appends the card when it changes chapter with no slot given', async () => {
        prisma.chapter.findUnique.mockResolvedValue({ id: 'ch-2', workId: 'work-1' });
        siblings(['x', 'y']);
        await service.updatePage('acc-me', 'page-1', { chapterId: 'ch-2' });
        expect(written()).toEqual({ 'page-1': 2 });
      });

      it('does not touch positions on an ordinary edit', async () => {
        siblings();
        await service.updatePage('acc-me', 'page-1', { title: 'Renommée' });
        expect(prisma.page.findMany).not.toHaveBeenCalled();
        expect(written()).toEqual({});
      });
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

    // Latent-bug fix 2026-09-01 — the detail include used to omit corrections, so the modal's
    // openCorrectionCount/Types were silently always 0/[].
    it('includes the open corrections so openCorrectionCount/Types are truthful in the detail', async () => {
      prisma.page.findUnique.mockResolvedValue(
        DETAIL({ corrections: [{ filedAgainstVersion: 3, type: 'dessin', asset: { currentVersion: 3 } }] }),
      );
      const res = await service.getDetail('acc-me', 'page-1');
      expect(res.openCorrectionCount).toBe(1);
      expect(res.openCorrectionTypes).toEqual(['dessin']);
      const { include } = prisma.page.findUnique.mock.calls[0][0];
      expect(include.corrections).toBeDefined();
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

    // CS-20 F5 — the card modal's file row states the pin, so the detail payload carries it too.
    it('carries the CS-20 handoff pin (the modal states it even when current)', async () => {
      prisma.page.findUnique.mockResolvedValue(
        DETAIL({ drawnAgainstVersion: 2, drawnAgainstAsset: { id: 'as-1', currentVersion: 5 } }),
      );
      const res = await service.getDetail('acc-me', 'page-1');
      expect(res.handoff).toEqual({ assetId: 'as-1', version: 2, headVersion: 5, stale: true });
      expect(prisma.page.findUnique.mock.calls[0][0].include.drawnAgainstAsset).toEqual({
        select: { id: true, currentVersion: true },
      });
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
      // CS-20: leaving Scénario also stamps the handoff pin in this same update (asserted below).
      expect(prisma.page.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'page-1' }, data: expect.objectContaining({ stage: 'nemu' }) }),
      );
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

  // ── CS-26 — the terminal column is gated the way PROPRE already is ─────────
  describe('updateStage → valide (CS-26 gate)', () => {
    /** An open correction row as the version-qualified read selects it. */
    const open = (filedAgainstVersion: number, currentVersion: number) => ({ filedAgainstVersion, asset: { currentVersion } });

    it('409 « Corrections non résolues » with the count when one is filed against the CURRENT version', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'encrage' }));
      prisma.correction.findMany.mockResolvedValue([open(5, 5), open(2, 5), open(1, 1)]);
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).rejects.toMatchObject({
        response: { message: 'Corrections non résolues', unresolved: 2 },
      });
      expect(prisma.page.update).not.toHaveBeenCalled();
    });

    it('allows the move when every open correction was filed against a SUPERSEDED version', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'encrage' }));
      prisma.correction.findMany.mockResolvedValue([open(2, 5), open(3, 5)]);
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).resolves.toMatchObject({ stage: 'valide' });
    });

    it('allows the move when everything is corrigé / the card has no linked assets (no open rows)', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'encrage' }));
      prisma.correction.findMany.mockResolvedValue([]);
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).resolves.toMatchObject({ stage: 'valide' });
      expect(prisma.correction.findMany.mock.calls[0][0].where).toEqual({ pageId: 'page-1', status: { not: 'corrige' } });
    });

    it('is a no-op, not a 409, when the card is already valide (idempotent branch)', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'valide' }));
      prisma.correction.findMany.mockResolvedValue([open(5, 5)]);
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).resolves.toMatchObject({ stage: 'valide' });
      expect(prisma.correction.findMany).not.toHaveBeenCalled();
    });

    it('never reads corrections for a move OUT of valide, or any other transition (the guard cannot creep)', async () => {
      for (const [from, to] of [
        ['valide', 'encrage'],
        ['valide', 'corrections'],
        ['scenario', 'nemu'],
        ['nemu', 'encrage'],
        ['corrections', 'propre'],
        ['propre', 'encrage'],
      ] as [string, string][]) {
        build();
        prisma.page.findUnique.mockResolvedValue(PAGE({ stage: from }));
        prisma.correction.findMany.mockResolvedValue([open(5, 5)]);
        await expect(service.updateStage('acc-me', 'page-1', { stage: to as never })).resolves.toMatchObject({ stage: to });
        expect(prisma.correction.findMany).not.toHaveBeenCalled();
      }
    });

    it('403 takes precedence over the 409 — a member without « Écriture » never reaches the gate', async () => {
      const project = PROJECT({
        work: {
          id: 'work-1',
          creators: [
            { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
            { accountId: 'acc-reader', groupRole: 'member', permissions: ['corrections'] },
          ],
        },
      });
      prisma.project.findUnique.mockResolvedValue(project);
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'encrage', project }));
      prisma.correction.findMany.mockResolvedValue([open(5, 5)]);
      await expect(service.updateStage('acc-reader', 'page-1', { stage: 'valide' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.correction.findMany).not.toHaveBeenCalled();
      expect(prisma.page.update).not.toHaveBeenCalled();
    });

    it('the 409 is a ConflictException (same class as the PROPRE route)', async () => {
      prisma.page.findUnique.mockResolvedValue(PAGE({ stage: 'encrage' }));
      prisma.correction.findMany.mockResolvedValue([open(1, 1)]);
      await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).rejects.toBeInstanceOf(ConflictException);
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
      ['createPage', (a: string) => service.createPage(a, 'lames-de-brume', { chapterId: 'ch-1' })],
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
      await service.createPage('acc-writer', 'lames-de-brume', { chapterId: 'ch-1' });
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
      await service.createPage('acc-me', 'lames-de-brume', { chapterId: 'ch-1' });
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

    // CS-26 — the board card carries the number that blocks VALIDÉ, so the block is predictable.
    it('openCorrectionCount tallies only corrections filed against the current version', () => {
      const row = (filedAgainstVersion: number, currentVersion: number) => ({ filedAgainstVersion, asset: { currentVersion } });
      expect(toWorkspacePage({ ...PAGE(), corrections: [row(5, 5), row(2, 5), row(1, 1)] } as never).openCorrectionCount).toBe(2);
      expect(toWorkspacePage({ ...PAGE(), corrections: [row(2, 5)] } as never).openCorrectionCount).toBe(0);
      expect(toWorkspacePage(PAGE() as never).openCorrectionCount).toBe(0);
    });

    // Feedback 2026-09-01 — the card also names WHICH file types those open corrections target.
    it('openCorrectionTypes lists unique against-current types, superseded excluded', () => {
      const row = (filedAgainstVersion: number, currentVersion: number, type: string) => ({ filedAgainstVersion, type, asset: { currentVersion } });
      expect(
        toWorkspacePage({ ...PAGE(), corrections: [row(5, 5, 'dessin'), row(5, 5, 'dessin'), row(1, 1, 'scenario'), row(2, 5, 'scenario')] } as never).openCorrectionTypes,
      ).toEqual(['dessin', 'scenario']);
      expect(toWorkspacePage(PAGE() as never).openCorrectionTypes).toEqual([]);
    });

    it('is [] when the assetLinks join is absent or empty', () => {
      expect(toWorkspacePage(PAGE() as never).linkedFiles).toEqual([]);
      expect(toWorkspacePage({ ...PAGE(), assetLinks: [] } as never).linkedFiles).toEqual([]);
    });
  });
  // ── CS-20 — the scenario handoff pin ───────────────────────────────────────
  describe('CS-20 — handoff pin', () => {
    const dataOf = () => prisma.page.update.mock.calls[0][0].data;
    /** The write resolver's own read carries the card's scenario links — the stamp adds no query. */
    const LINKED = (o: Record<string, unknown> = {}) =>
      PAGE({ assetLinks: [{ asset: { id: 'asset-scn', filename: 'scenario.html', currentVersion: 5 } }], ...o });

    describe('stamp on leaving Scénario (updateStage)', () => {
      beforeEach(() => prisma.page.findUnique.mockResolvedValue(LINKED()));

      it('stamps the card\'s linked scenario asset + its head version in the SAME update', async () => {
        await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
        expect(dataOf()).toEqual({ stage: 'nemu', drawnAgainstAssetId: 'asset-scn', drawnAgainstVersion: 5 });
      });

      it('moves with no pin and no error when the card has no linked scenario asset', async () => {
        prisma.page.findUnique.mockResolvedValue(LINKED({ assetLinks: [] }));
        await expect(service.updateStage('acc-me', 'page-1', { stage: 'nemu' })).resolves.toMatchObject({ stage: 'nemu' });
        expect(dataOf()).toEqual({ stage: 'nemu' });
      });

      it('NEVER overwrites an existing pin (re-pinning is the explicit acknowledge)', async () => {
        prisma.page.findUnique.mockResolvedValue(LINKED({ drawnAgainstAssetId: 'asset-old', drawnAgainstVersion: 2 }));
        await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
        expect(dataOf()).toEqual({ stage: 'nemu' });
      });

      it('never stamps on a move that does not leave Scénario', async () => {
        prisma.page.findUnique.mockResolvedValue(LINKED({ stage: 'nemu' }));
        await service.updateStage('acc-me', 'page-1', { stage: 'encrage' });
        expect(dataOf()).toEqual({ stage: 'encrage' });
      });

      // The stamp sits AFTER the CS-26 VALIDÉ guard: a refused move pins nothing.
      it('does not stamp when the CS-26 VALIDÉ guard refuses the move', async () => {
        prisma.correction.findMany.mockResolvedValue([{ filedAgainstVersion: 5, asset: { currentVersion: 5 } }]);
        await expect(service.updateStage('acc-me', 'page-1', { stage: 'valide' })).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.page.update).not.toHaveBeenCalled();
      });

      it('picks the scenario asset deterministically (lowest filename) among the card\'s links', async () => {
        prisma.page.findUnique.mockResolvedValue(
          LINKED({
            assetLinks: [
              { asset: { id: 'asset-b', filename: 'b-scenario.html', currentVersion: 9 } },
              { asset: { id: 'asset-a', filename: 'a-scenario.html', currentVersion: 4 } },
            ],
          }),
        );
        await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
        expect(dataOf()).toMatchObject({ drawnAgainstAssetId: 'asset-a', drawnAgainstVersion: 4 });
      });

      // The stage route is answered OPTIMISTICALLY by the board and the card modal re-reads the card
      // right after: an extra round-trip here widens a real read-after-write window, so the stamp must
      // add none. One resolver read, one update — exactly as many as before CS-20.
      it('adds no extra query — the scenario link comes off the resolver read', async () => {
        await service.updateStage('acc-me', 'page-1', { stage: 'nemu' });
        expect(prisma.page.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.page.update).toHaveBeenCalledTimes(1);
        expect(prisma.asset).toBeUndefined();
      });
    });

    describe('acknowledgeHandoff', () => {
      const PINNED = (version: number, headVersion = 7) =>
        PAGE({ drawnAgainstAssetId: 'asset-scn', drawnAgainstVersion: version, drawnAgainstAsset: { id: 'asset-scn', currentVersion: headVersion } });

      it('re-pins the card to the asset\'s current head', async () => {
        prisma.page.findUnique.mockResolvedValue(PINNED(2));
        await service.acknowledgeHandoff('acc-me', 'page-1');
        expect(dataOf()).toEqual({ drawnAgainstVersion: 7 });
      });

      it('is idempotent when the pin is already at head (no error, pin unchanged)', async () => {
        prisma.page.findUnique.mockResolvedValue(PINNED(7));
        await expect(service.acknowledgeHandoff('acc-me', 'page-1')).resolves.toBeDefined();
        expect(dataOf()).toEqual({ drawnAgainstVersion: 7 });
      });

      it('409 « Aucune passation enregistrée » when the card has no pin', async () => {
        await expect(service.acknowledgeHandoff('acc-me', 'page-1')).rejects.toBeInstanceOf(ConflictException);
        await expect(service.acknowledgeHandoff('acc-me', 'page-1')).rejects.toThrow('Aucune passation enregistrée');
        expect(prisma.page.update).not.toHaveBeenCalled();
      });
    });

    describe('deleteHandoff', () => {
      it('drops both pin columns', async () => {
        prisma.page.findUnique.mockResolvedValue(PAGE({ drawnAgainstAssetId: 'asset-scn', drawnAgainstVersion: 2, drawnAgainstAsset: { id: 'asset-scn', currentVersion: 7 } }));
        await service.deleteHandoff('acc-me', 'page-1');
        expect(dataOf()).toEqual({ drawnAgainstAssetId: null, drawnAgainstVersion: null });
      });

      it('404 « Aucune passation enregistrée » when there is no pin', async () => {
        await expect(service.deleteHandoff('acc-me', 'page-1')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.deleteHandoff('acc-me', 'page-1')).rejects.toThrow('Aucune passation enregistrée');
        expect(prisma.page.update).not.toHaveBeenCalled();
      });
    });

    // A5 — the banner is readable by everyone, but both writes need « Écriture ».
    describe('« Écriture » gate', () => {
      const READER_PROJECT = () =>
        PROJECT({
          work: {
            id: 'work-1',
            creators: [
              { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
              { accountId: 'acc-reader', groupRole: 'member', permissions: ['corrections'] },
            ],
          },
        });

      it.each([
        ['acknowledgeHandoff', (a: string) => service.acknowledgeHandoff(a, 'page-1')],
        ['deleteHandoff', (a: string) => service.deleteHandoff(a, 'page-1')],
      ] as [string, (a: string) => Promise<unknown>][])('%s refuses a member without « Écriture » (403), persists nothing', async (_n, call) => {
        const project = READER_PROJECT();
        prisma.project.findUnique.mockResolvedValue(project);
        prisma.page.findUnique.mockResolvedValue(PAGE({ project, drawnAgainstAssetId: 'asset-scn', drawnAgainstVersion: 2, drawnAgainstAsset: { id: 'asset-scn', currentVersion: 7 } }));
        await expect(call('acc-reader')).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.page.update).not.toHaveBeenCalled();
      });
    });

    // B5 — `stale` is derived server-side from the ONE included pinned-asset row, never per card.
    describe('toWorkspacePage handoff', () => {
      const pinned = (version: number, headVersion: number) => ({
        ...PAGE(),
        drawnAgainstVersion: version,
        drawnAgainstAsset: { id: 'asset-scn', currentVersion: headVersion },
      });

      it('is stale when the pin is behind the head', () => {
        expect(toWorkspacePage(pinned(2, 5) as never).handoff).toEqual({ assetId: 'asset-scn', version: 2, headVersion: 5, stale: true });
      });

      it('is not stale when the pin is at head', () => {
        expect(toWorkspacePage(pinned(5, 5) as never).handoff).toEqual({ assetId: 'asset-scn', version: 5, headVersion: 5, stale: false });
      });

      // A6 — the FK's SetNull drops the pin when the asset is deleted; nothing 500s, nothing renders.
      it('is null when there is no pin (older card) or the pinned asset was deleted', () => {
        expect(toWorkspacePage(PAGE() as never).handoff).toBeNull();
        expect(toWorkspacePage({ ...PAGE(), drawnAgainstVersion: 3, drawnAgainstAsset: null } as never).handoff).toBeNull();
      });
    });

    // D-5 — the handoff OFFER's signal: the scenario doc has edits newer than its head version.
    describe('toWorkspacePage scenarioUnsaved', () => {
      const link = (o: Record<string, unknown> = {}) => ({
        asset: {
          id: 'as-1',
          type: 'scenario',
          filename: 'scenario.txt',
          currentVersion: 3,
          scenarioDoc: { updatedAt: new Date('2026-08-02T10:00:00Z') },
          versions: [{ createdAt: new Date('2026-08-01T10:00:00Z') }],
          ...o,
        },
      });

      it('is true when the editor draft is newer than the head version', () => {
        expect(toWorkspacePage({ ...PAGE(), assetLinks: [link()] } as never).scenarioUnsaved).toBe(true);
      });

      // The first save creates v1 and THEN the document row, so a freshly-versioned doc is always a
      // few ms "newer" than its own head — without the grace window every handoff would prompt.
      it('is false for a doc written milliseconds after its own version (the materialize path)', () => {
        expect(
          toWorkspacePage({
            ...PAGE(),
            assetLinks: [
              link({
                scenarioDoc: { updatedAt: new Date('2026-08-01T10:00:03.000Z') },
                versions: [{ createdAt: new Date('2026-08-01T10:00:00.000Z') }],
              }),
            ],
          } as never).scenarioUnsaved,
        ).toBe(false);
      });

      it('is false when the head version is newer than (or equal to) the draft', () => {
        expect(
          toWorkspacePage({ ...PAGE(), assetLinks: [link({ versions: [{ createdAt: new Date('2026-08-03T10:00:00Z') }] })] } as never).scenarioUnsaved,
        ).toBe(false);
      });

      // Follow-up 7 — with the real `versionedAt` column the comparison is exact: an edit made one
      // second after the version write IS flagged (the case the 5s grace window used to miss).
      it('is true for an edit made immediately after the version write (versionedAt)', () => {
        expect(
          toWorkspacePage({
            ...PAGE(),
            assetLinks: [
              link({
                scenarioDoc: { updatedAt: new Date('2026-08-01T10:00:01.000Z'), versionedAt: new Date('2026-08-01T10:00:00.000Z') },
                versions: [{ createdAt: new Date('2026-08-01T10:00:00.000Z') }],
              }),
            ],
          } as never).scenarioUnsaved,
        ).toBe(true);
      });

      it('is false right after a version write with no edit since (updatedAt === versionedAt)', () => {
        expect(
          toWorkspacePage({
            ...PAGE(),
            assetLinks: [
              link({
                scenarioDoc: { updatedAt: new Date('2026-08-01T10:00:00.000Z'), versionedAt: new Date('2026-08-01T10:00:00.000Z') },
                versions: [{ createdAt: new Date('2026-08-01T10:00:00.000Z') }],
              }),
            ],
          } as never).scenarioUnsaved,
        ).toBe(false);
      });

      // Legacy rows (written before the column existed) keep the old timestamp comparison, grace
      // window included — the migration back-fills nothing, so they must not change behaviour.
      it('falls back to the grace window for a legacy row (versionedAt: null)', () => {
        const legacy = (draft: string) =>
          toWorkspacePage({
            ...PAGE(),
            assetLinks: [
              link({
                scenarioDoc: { updatedAt: new Date(draft), versionedAt: null },
                versions: [{ createdAt: new Date('2026-08-01T10:00:00.000Z') }],
              }),
            ],
          } as never).scenarioUnsaved;
        expect(legacy('2026-08-01T10:00:03.000Z')).toBe(false); // inside the window
        expect(legacy('2026-08-01T10:00:30.000Z')).toBe(true);
      });

      it('is false with no scenario asset and with no editor draft', () => {
        expect(toWorkspacePage(PAGE() as never).scenarioUnsaved).toBe(false);
        expect(toWorkspacePage({ ...PAGE(), assetLinks: [link({ scenarioDoc: null })] } as never).scenarioUnsaved).toBe(false);
      });
    });
  });
});
