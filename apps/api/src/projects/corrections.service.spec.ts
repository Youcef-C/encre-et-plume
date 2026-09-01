import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';

const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  title: 'Lames de brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: {
    id: 'work-1',
    creators: [
      { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
      { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture', 'corrections'] },
    ],
  },
  ...o,
});

/** CS-10: the same project with Yuki's « Corrections » toggle switched off. */
const PROJECT_NO_CORRECTIONS = () =>
  PROJECT({
    work: {
      id: 'work-1',
      creators: [
        { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
        { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture'] },
      ],
    },
  });

const PAGE = (o: Record<string, unknown> = {}) => ({
  id: 'page-1',
  projectId: 'proj-1',
  title: 'Page 1',
  stage: 'corrections',
  assignees: [],
  project: PROJECT(),
  ...o,
});

const CORRECTION = (o: Record<string, unknown> = {}) => ({
  id: 'corr-1',
  pageId: 'page-1',
  type: 'dessin',
  anchor: { region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
  assetId: 'asset-dessin',
  caseRef: null,
  description: 'Corriger le nez',
  status: 'a_corriger',
  authorId: 'acc-me',
  assigneeId: null,
  filedAgainstVersion: 2,
  resolvedInVersion: null,
  // CS-24 — who pressed « Corrigé » and when the filer acknowledged it.
  resolvedById: null,
  resolvedBy: null,
  verifiedAt: null,
  createdAt: new Date('2026-07-15T10:00:00Z'),
  author: { displayName: 'Moi' },
  asset: { id: 'asset-dessin', currentVersion: 3 },
  ...o,
});

describe('CorrectionsService', () => {
  let service: CorrectionsService;
  let prisma: any;
  let pages: { loadMemberPage: jest.Mock };
  let notifications: { create: jest.Mock };
  let media: { signedUrl: jest.Mock };
  let s3: { getObjectBuffer: jest.Mock };
  let gateway: { emitComment: jest.Mock; emitCommentDeleted: jest.Mock };

  const build = () => {
    prisma = {
      scenarioComment: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'cmt-1', createdAt: new Date('2026-07-15T10:00:00Z'), ...data, author: { displayName: 'Moi' } }),
        ),
        delete: jest.fn().mockResolvedValue({ id: 'cmt-1' }),
      },
      $transaction: jest.fn((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
      correction: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(CORRECTION({ ...data, author: { displayName: 'Moi' }, asset: { id: data.assetId, currentVersion: 3 } }))),
        findUnique: jest.fn().mockResolvedValue(CORRECTION()),
        findFirst: jest.fn().mockResolvedValue(CORRECTION()),
        findMany: jest.fn().mockResolvedValue([CORRECTION()]),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(CORRECTION(data))),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _min: { filedAgainstVersion: null } }),
      },
      scenarioDocument: {
        findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', asset: { id: 'asset-scenario', projectId: 'proj-1', currentVersion: 2 } }),
      },
      asset: {
        findFirst: jest.fn().mockResolvedValue({ id: 'asset-dessin', currentVersion: 3, type: 'dessin' }),
        findUnique: jest.fn().mockResolvedValue({ filename: 'planche.png' }),
      },
      assetVersion: {
        findMany: jest.fn().mockResolvedValue([
          { version: 3, mediaId: 'media-3', note: null, createdAt: new Date('2026-07-15T09:00:00Z'), author: { displayName: 'Moi' } },
          { version: 2, mediaId: 'media-2', note: 'v2', createdAt: new Date('2026-07-14T09:00:00Z'), author: { displayName: 'Yuki' } },
        ]),
      },
      assetPageLink: {
        findMany: jest.fn().mockResolvedValue([
          { asset: { id: 'asset-dessin', filename: 'planche.png', type: 'dessin', currentVersion: 3 } },
        ]),
      },
      media: { findUnique: jest.fn().mockResolvedValue({ id: 'media-3', bucketKey: 'k', contentType: 'image/png' }) },
      account: { findMany: jest.fn().mockResolvedValue([{ id: 'acc-me', displayName: 'Moi', avatar: null }]) },
      page: { update: jest.fn().mockResolvedValue({}) },
    };
    pages = { loadMemberPage: jest.fn().mockResolvedValue(PAGE()) };
    notifications = { create: jest.fn().mockResolvedValue(null) };
    media = { signedUrl: jest.fn().mockResolvedValue({ url: 'https://img/signed' }) };
    s3 = { getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('<p>hello</p>')) };
    gateway = { emitComment: jest.fn(), emitCommentDeleted: jest.fn() };
    service = new CorrectionsService(prisma, pages as any, notifications as any, media as any, s3 as any, gateway as any);
  };

  beforeEach(build);

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a scenario correction: resolves document→asset, stamps filedAgainstVersion=head', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler' } as any;
      const res = await service.create('acc-me', 'page-1', dto);
      const data = prisma.correction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ type: 'scenario', assetId: 'asset-scenario', filedAgainstVersion: 2, authorId: 'acc-me' });
      expect(res.type).toBe('scenario');
    });

    it('rejects a scenario anchor with from >= to (400)', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 10, to: 10, quote: 'x' }, description: 'y' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty description (400)', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 1, to: 4, quote: 'x' }, description: '   ' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects a foreign document (404, no leak)', async () => {
      prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-2', asset: { id: 'a', projectId: 'other-proj', currentVersion: 1 } });
      const dto = { type: 'scenario', anchor: { documentId: 'doc-2', from: 1, to: 4, quote: 'x' }, description: 'y' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('creates a dessin correction: validates region bounds, stamps head', async () => {
      const dto = { type: 'dessin', assetId: 'asset-dessin', anchor: { region: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } }, description: 'Le nez' } as any;
      const res = await service.create('acc-me', 'page-1', dto);
      expect(prisma.correction.create.mock.calls[0][0].data).toMatchObject({ type: 'dessin', assetId: 'asset-dessin', filedAgainstVersion: 3 });
      expect(res.type).toBe('dessin');
    });

    it('rejects an out-of-bounds dessin region (400)', async () => {
      const dto = { type: 'dessin', assetId: 'asset-dessin', anchor: { region: { x: 0.9, y: 0.1, w: 0.3, h: 0.3 } }, description: 'x' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects a dessin asset of the wrong type/project (404)', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);
      const dto = { type: 'dessin', assetId: 'asset-x', anchor: { region: { x: 0, y: 0, w: 0.5, h: 0.5 } }, description: 'x' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(NotFoundException);
    });

    // B9 (Fb-2) — a scenario correction IS a tagged CS-4 comment: comment + correction in one transaction,
    // linked by commentId, and the comment is fanned out over WS so open editors paint the highlight.
    it('scenario create writes a ScenarioComment + Correction in one transaction, linked by commentId', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler', caseNo: 2 } as any;
      await service.create('acc-me', 'page-1', dto);
      expect(prisma.$transaction).toHaveBeenCalled();
      const commentData = prisma.scenarioComment.create.mock.calls[0][0].data;
      expect(commentData).toMatchObject({ documentId: 'doc-1', caseNo: 2, authorId: 'acc-me', text: 'Reformuler', anchorFrom: 3, anchorTo: 10, quote: 'texte', version: 2 });
      const corrData = prisma.correction.create.mock.calls[0][0].data;
      expect(corrData).toMatchObject({ type: 'scenario', assetId: 'asset-scenario', authorId: 'acc-me', commentId: 'cmt-1' });
    });

    it('scenario create defaults caseNo to 1 when omitted', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler' } as any;
      await service.create('acc-me', 'page-1', dto);
      expect(prisma.scenarioComment.create.mock.calls[0][0].data).toMatchObject({ caseNo: 1 });
    });

    it('scenario create fans out the tagged comment over WS (highlight + sidebar row live)', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler' } as any;
      await service.create('acc-me', 'page-1', dto);
      expect(gateway.emitComment).toHaveBeenCalledWith(
        'asset-scenario',
        expect.objectContaining({ id: 'cmt-1', text: 'Reformuler', version: 2, correction: { id: 'corr-1', status: 'a_corriger', assigneeId: null } }),
      );
    });

    it('a dessin correction creates NO comment and emits nothing (unaffected by unification)', async () => {
      const dto = { type: 'dessin', assetId: 'asset-dessin', anchor: { region: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } }, description: 'Le nez' } as any;
      await service.create('acc-me', 'page-1', dto);
      expect(prisma.scenarioComment.create).not.toHaveBeenCalled();
      expect(gateway.emitComment).not.toHaveBeenCalled();
    });

    // CS-22 — the scenario correction's backing comment carries the durable relative anchor too, so a
    // correction highlight survives a reload exactly like a plain comment (AC5). No Correction schema change.
    it('persists the relative anchor pair on the backing comment and fans it out', async () => {
      const relFrom = Buffer.from([9, 9, 9]).toString('base64');
      const relTo = Buffer.from([7, 7, 7]).toString('base64');
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte', relFrom, relTo }, description: 'Reformuler' } as any;
      await service.create('acc-me', 'page-1', dto);
      const data = prisma.scenarioComment.create.mock.calls[0][0].data;
      expect(data.anchorRelFrom).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(data.anchorRelFrom).toString('base64')).toBe(relFrom);
      expect(Buffer.from(data.anchorRelTo).toString('base64')).toBe(relTo);
      expect(gateway.emitComment).toHaveBeenCalledWith('asset-scenario', expect.objectContaining({ anchorRelFrom: relFrom, anchorRelTo: relTo }));
    });

    it('a correction without a relative anchor stores nulls (pre-CS-22 client)', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler' } as any;
      await service.create('acc-me', 'page-1', dto);
      const data = prisma.scenarioComment.create.mock.calls[0][0].data;
      expect(data.anchorRelFrom).toBeNull();
      expect(data.anchorRelTo).toBeNull();
      expect(gateway.emitComment).toHaveBeenCalledWith('asset-scenario', expect.objectContaining({ anchorRelFrom: null, anchorRelTo: null }));
    });

    it('400s an over-long relative anchor on a correction (never decoded)', async () => {
      const dto = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte', relFrom: Buffer.alloc(513).toString('base64') }, description: 'Reformuler' } as any;
      await expect(service.create('acc-me', 'page-1', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.scenarioComment.create).not.toHaveBeenCalled();
    });

    // B12 (Fb-8, BLOCKING) — the server stamps authorId from the authenticated session ONLY. A client
    // that injects an authorId into the body cannot attribute the comment/correction to another account.
    it('B12: ignores a client-supplied authorId — stamps the acting session account on both rows', async () => {
      const rogue = { type: 'scenario', anchor: { documentId: 'doc-1', from: 3, to: 10, quote: 'texte' }, description: 'Reformuler', authorId: 'acc-yuki' } as any;
      const res = await service.create('acc-me', 'page-1', rogue);
      expect(prisma.scenarioComment.create.mock.calls[0][0].data.authorId).toBe('acc-me');
      expect(prisma.correction.create.mock.calls[0][0].data.authorId).toBe('acc-me');
      expect(res.authorId).toBe('acc-me');
    });

    it('notifies the other members on create (best-effort)', async () => {
      const dto = { type: 'dessin', assetId: 'asset-dessin', anchor: { region: { x: 0, y: 0, w: 0.5, h: 0.5 } }, description: 'x' } as any;
      await service.create('acc-me', 'page-1', dto);
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'acc-yuki' }));
      expect(notifications.create).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'acc-me' }));
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────────
  describe('updateStatus', () => {
    it('author may mark corrige; stamps resolvedInVersion = current head', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me' }));
      await service.updateStatus('acc-me', 'corr-1', { status: 'corrige' });
      expect(prisma.correction.update.mock.calls[0][0].data).toMatchObject({ status: 'corrige', resolvedInVersion: 3 });
    });

    it('assignee may change status', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki', assigneeId: 'acc-me' }));
      await service.updateStatus('acc-me', 'corr-1', { status: 'en_cours' });
      expect(prisma.correction.update).toHaveBeenCalled();
    });

    it('reopening to en_cours clears resolvedInVersion', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', status: 'corrige', resolvedInVersion: 3 }));
      await service.updateStatus('acc-me', 'corr-1', { status: 'en_cours' });
      expect(prisma.correction.update.mock.calls[0][0].data).toMatchObject({ status: 'en_cours', resolvedInVersion: null });
    });

    it('a member who is neither author nor assignee is rejected (403)', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki', assigneeId: null }));
      pages.loadMemberPage.mockResolvedValue(PAGE());
      await expect(service.updateStatus('acc-me', 'corr-1', { status: 'corrige' })).rejects.toThrow(ForbiddenException);
    });

    // ── Feedback round 2 (2026-09-01) — (re)assign after creation via the same PATCH ──
    it('an assignee-only PATCH sets assigneeId and leaves the status untouched', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me' }));
      await service.updateStatus('acc-me', 'corr-1', { assigneeId: 'acc-yuki' });
      const { data } = prisma.correction.update.mock.calls[0][0];
      expect(data).toMatchObject({ assigneeId: 'acc-yuki' });
      expect(data.status).toBeUndefined();
      expect(data.resolvedInVersion).toBeUndefined();
    });

    it('assigneeId: null unassigns', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await service.updateStatus('acc-me', 'corr-1', { assigneeId: null });
      expect(prisma.correction.update.mock.calls[0][0].data).toMatchObject({ assigneeId: null });
    });

    it('assigning a non-member is a 400', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me' }));
      await expect(service.updateStatus('acc-me', 'corr-1', { assigneeId: 'stranger' })).rejects.toThrow(BadRequestException);
    });

    it('an empty PATCH (neither status nor assigneeId) is a 400', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me' }));
      await expect(service.updateStatus('acc-me', 'corr-1', {})).rejects.toThrow(BadRequestException);
    });

    it('a new assignee (not the actor) is notified', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: null }));
      await service.updateStatus('acc-me', 'corr-1', { assigneeId: 'acc-yuki' });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'acc-yuki', refId: 'corr-1' }),
      );
    });

    it('a non-member is rejected (loadMemberPage throws)', async () => {
      pages.loadMemberPage.mockRejectedValue(new ForbiddenException());
      await expect(service.updateStatus('stranger', 'corr-1', { status: 'corrige' })).rejects.toThrow(ForbiddenException);
    });

    // ── CS-24 — the verification loop ────────────────────────────────────────
    it('CS-24: marking corrige stamps resolvedById = the acting account (neither authorId nor assigneeId records it)', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await service.updateStatus('acc-yuki', 'corr-1', { status: 'corrige' });
      expect(prisma.correction.update.mock.calls[0][0].data).toMatchObject({ status: 'corrige', resolvedInVersion: 3, resolvedById: 'acc-yuki' });
    });

    it('CS-24: reopening to a_corriger clears resolvedInVersion, resolvedById AND verifiedAt', async () => {
      prisma.correction.findUnique.mockResolvedValue(
        CORRECTION({ authorId: 'acc-me', status: 'corrige', resolvedInVersion: 3, resolvedById: 'acc-yuki', verifiedAt: new Date('2026-07-16T10:00:00Z') }),
      );
      await service.updateStatus('acc-me', 'corr-1', { status: 'a_corriger' });
      expect(prisma.correction.update.mock.calls[0][0].data).toMatchObject({
        status: 'a_corriger',
        resolvedInVersion: null,
        resolvedById: null,
        verifiedAt: null,
      });
    });

    it('CS-24: the filer is notified with the dedicated copy and refId = the correction id', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await service.updateStatus('acc-yuki', 'corr-1', { status: 'corrige' });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'acc-me',
          type: 'project_activity',
          refId: 'corr-1',
          message: 'Votre correction a été marquée corrigée',
        }),
      );
    });

    it('CS-24: self-resolution notifies nobody', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await service.updateStatus('acc-me', 'corr-1', { status: 'corrige' });
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('CS-24: the other transitions keep the generic fan-out (no refId hijack)', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await service.updateStatus('acc-yuki', 'corr-1', { status: 'en_cours' });
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'acc-me', refId: 'proj-1' }));
    });

    it('CS-24: a failing notification never fails the status change', async () => {
      notifications.create.mockRejectedValue(new Error('down'));
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki' }));
      await expect(service.updateStatus('acc-yuki', 'corr-1', { status: 'corrige' })).resolves.toMatchObject({ status: 'corrige' });
    });

    it('404 on unknown correction', async () => {
      prisma.correction.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('acc-me', 'nope', { status: 'corrige' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('author deletes a legacy (comment-less) note directly', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', commentId: null }));
      await service.remove('acc-me', 'corr-1');
      expect(prisma.correction.delete).toHaveBeenCalledWith({ where: { id: 'corr-1' } });
    });

    // B9 (Fb-2) — a scenario correction is a tagged comment: deleting the correction deletes the backing
    // comment (DB cascade removes the correction), and the deletion fans out to open editors.
    it('deletes the backing comment (cascade) + emits commentDeleted when commentId is set', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-me', commentId: 'cmt-1', assetId: 'asset-scenario' }));
      await service.remove('acc-me', 'corr-1');
      expect(prisma.scenarioComment.delete).toHaveBeenCalledWith({ where: { id: 'cmt-1' } });
      expect(prisma.correction.delete).not.toHaveBeenCalled(); // cascade handles it
      expect(gateway.emitCommentDeleted).toHaveBeenCalledWith('asset-scenario', 'cmt-1');
    });

    it('a non-author is rejected (403)', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki' }));
      await expect(service.remove('acc-me', 'corr-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────────
  describe('list', () => {
    it('composes type + status filters and returns the paginated shape', async () => {
      prisma.correction.count.mockResolvedValue(1);
      const res = await service.list('acc-me', 'page-1', { type: 'dessin', status: 'a_corriger' });
      const where = prisma.correction.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ pageId: 'page-1', type: 'dessin', status: 'a_corriger' });
      expect(res).toMatchObject({ total: 1, page: 1, pageSize: 50, totalPages: 1 });
    });

    it('orders by createdAt asc', async () => {
      await service.list('acc-me', 'page-1', {});
      expect(prisma.correction.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
    });
  });

  // ── validate ───────────────────────────────────────────────────────────────
  describe('validate', () => {
    it('409 with the unresolved count when a correction is not corrige', async () => {
      prisma.correction.count.mockResolvedValue(2);
      await expect(service.validate('acc-me', 'page-1')).rejects.toMatchObject({ response: expect.objectContaining({ unresolved: 2 }) });
    });

    it('transitions corrections → propre when all corrige', async () => {
      prisma.correction.count.mockResolvedValue(0);
      const res = await service.validate('acc-me', 'page-1');
      expect(prisma.page.update).toHaveBeenCalledWith({ where: { id: 'page-1' }, data: { stage: 'propre' } });
      expect(res.stage).toBe('propre');
    });

    // CS-24 A7 — verification is ADVISORY: a resolved-but-unverified correction must not block the
    // PROPRE transition. Asserted explicitly so making it blocking is a deliberate change.
    it('CS-24: still validates with resolved-but-unverified corrections (advisory, not blocking)', async () => {
      prisma.correction.count.mockResolvedValue(0); // zero UNRESOLVED — verifiedAt plays no part
      prisma.correction.findMany.mockResolvedValue([CORRECTION({ status: 'corrige', resolvedById: 'acc-yuki', verifiedAt: null })]);
      const res = await service.validate('acc-me', 'page-1');
      expect(prisma.correction.count).toHaveBeenCalledWith({ where: { pageId: 'page-1', status: { not: 'corrige' } } });
      expect(prisma.page.update).toHaveBeenCalledWith({ where: { id: 'page-1' }, data: { stage: 'propre' } });
      expect(res.stage).toBe('propre');
    });

    it('is idempotent when the page is already propre', async () => {
      pages.loadMemberPage.mockResolvedValue(PAGE({ stage: 'propre' }));
      const res = await service.validate('acc-me', 'page-1');
      expect(prisma.page.update).not.toHaveBeenCalled();
      expect(res.stage).toBe('propre');
    });

    it('409 when the page is in another stage', async () => {
      pages.loadMemberPage.mockResolvedValue(PAGE({ stage: 'scenario' }));
      await expect(service.validate('acc-me', 'page-1')).rejects.toThrow(ConflictException);
    });

    it('non-member rejected (loadMemberPage throws)', async () => {
      pages.loadMemberPage.mockRejectedValue(new ForbiddenException());
      await expect(service.validate('stranger', 'page-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── CS-10: the group « Corrections » permission gates every write path ──────
  describe('corrections permission (CS-10)', () => {
    const dessin = { type: 'dessin' as const, assetId: 'asset-dessin', anchor: { region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, description: 'Nez' };
    const denied = new ForbiddenException("Vous n'avez pas la permission « Corrections » sur ce projet.");

    beforeEach(() => pages.loadMemberPage.mockResolvedValue(PAGE({ project: PROJECT_NO_CORRECTIONS() })));

    it('403s creating a correction without the permission', async () => {
      await expect(service.create('acc-yuki', 'page-1', dessin)).rejects.toThrow(denied);
    });

    it('403s a status change without the permission', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki' }));
      await expect(service.updateStatus('acc-yuki', 'corr-1', { status: 'corrige' })).rejects.toThrow(denied);
    });

    it('403s validating the review without the permission', async () => {
      prisma.correction.count.mockResolvedValue(0);
      await expect(service.validate('acc-yuki', 'page-1')).rejects.toThrow(denied);
    });

    it('allows a leader (leadership implies every permission)', async () => {
      prisma.correction.count.mockResolvedValue(0);
      await expect(service.validate('acc-me', 'page-1')).resolves.toMatchObject({ stage: 'propre' });
    });

    // Round-3 sweep (T-API-10): `remove()` was the one corrections mutation without the gate — the
    // same gateway/REST split class as B-2, closed here for symmetry with create/updateStatus/validate.
    it('403s deleting a correction without the permission (even for its own author)', async () => {
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki', commentId: null }));
      await expect(service.remove('acc-yuki', 'corr-1')).rejects.toThrow(denied);
      expect(prisma.correction.delete).not.toHaveBeenCalled();
    });

    it('lets the author delete when the Corrections toggle is on', async () => {
      pages.loadMemberPage.mockResolvedValue(PAGE());
      prisma.correction.findUnique.mockResolvedValue(CORRECTION({ authorId: 'acc-yuki', commentId: null }));
      await service.remove('acc-yuki', 'corr-1');
      expect(prisma.correction.delete).toHaveBeenCalledWith({ where: { id: 'corr-1' } });
    });

    it('allows a member whose Corrections toggle is on', async () => {
      pages.loadMemberPage.mockResolvedValue(PAGE());
      await expect(service.create('acc-yuki', 'page-1', dessin)).resolves.toMatchObject({ description: 'Nez' });
    });
  });

  // ── verify (CS-24) ───────────────────────────────────────────────────────────
  describe('verify', () => {
    const resolved = (o: Record<string, unknown> = {}) =>
      CORRECTION({ authorId: 'acc-me', assigneeId: 'acc-yuki', status: 'corrige', resolvedInVersion: 3, resolvedById: 'acc-yuki', ...o });

    it('the filer sets verifiedAt without touching the status', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved());
      const res = await service.verify('acc-me', 'corr-1');
      const data = prisma.correction.update.mock.calls[0][0].data;
      expect(data.verifiedAt).toBeInstanceOf(Date);
      expect(data.status).toBeUndefined(); // the status is NOT touched by a verification
      expect(res.verifiedAt).not.toBeNull();
    });

    it('is idempotent when already verified (no second write)', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved({ verifiedAt: new Date('2026-07-16T10:00:00Z') }));
      const res = await service.verify('acc-me', 'corr-1');
      expect(prisma.correction.update).not.toHaveBeenCalled();
      expect(res.verifiedAt).toBe('2026-07-16T10:00:00.000Z');
    });

    it('403s anyone but the filer — including the assignee who resolved it', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved());
      await expect(service.verify('acc-yuki', 'corr-1')).rejects.toThrow(
        new ForbiddenException("Seul·e l'auteur·rice de la demande peut vérifier"),
      );
    });

    it('409s when the correction is not marked corrigé', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved({ status: 'en_cours', resolvedById: null }));
      await expect(service.verify('acc-me', 'corr-1')).rejects.toThrow(
        new ConflictException('La correction n\'est pas marquée corrigée'),
      );
    });

    it('404s an unknown correction', async () => {
      prisma.correction.findUnique.mockResolvedValue(null);
      await expect(service.verify('acc-me', 'nope')).rejects.toThrow(NotFoundException);
    });

    it('a non-member is rejected (loadMemberPage throws)', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved());
      pages.loadMemberPage.mockRejectedValue(new ForbiddenException());
      await expect(service.verify('stranger', 'corr-1')).rejects.toThrow(ForbiddenException);
    });

    it('403s without the « Corrections » permission', async () => {
      prisma.correction.findUnique.mockResolvedValue(resolved({ authorId: 'acc-yuki' }));
      pages.loadMemberPage.mockResolvedValue(PAGE({ project: PROJECT_NO_CORRECTIONS() }));
      await expect(service.verify('acc-yuki', 'corr-1')).rejects.toThrow(
        new ForbiddenException("Vous n'avez pas la permission « Corrections » sur ce projet."),
      );
    });
  });

  // ── location (CS-24 deep-link resolver) ──────────────────────────────────────
  describe('location', () => {
    it('resolves a correction id to its project slug + page id', async () => {
      prisma.correction.findUnique.mockResolvedValue({ pageId: 'page-1', type: 'dessin', assetId: 'asset-9' });
      await expect(service.location('acc-me', 'corr-1')).resolves.toEqual({
        projectSlug: 'lames-de-brume',
        pageId: 'page-1',
        type: 'dessin',
        assetId: null, // a dessin correction is read in the review list; no asset to open
      });
    });

    // CS-24 follow-up — the caller needs the SURFACE. A scenario correction is a tagged CS-4 comment
    // and is read in the editor; the review list is dessin-only (CS-5 r4) and could never show it.
    it('reports the scenario surface and the asset to open', async () => {
      prisma.correction.findUnique.mockResolvedValue({ pageId: 'page-1', type: 'scenario', assetId: 'asset-9' });
      await expect(service.location('acc-me', 'corr-1')).resolves.toEqual({
        projectSlug: 'lames-de-brume',
        pageId: 'page-1',
        type: 'scenario',
        assetId: 'asset-9',
      });
    });

    it('404s an id that is not a correction (a project id from another producer)', async () => {
      prisma.correction.findUnique.mockResolvedValue(null);
      await expect(service.location('acc-me', 'proj-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a non-member (loadMemberPage throws — no existence leak)', async () => {
      prisma.correction.findUnique.mockResolvedValue({ pageId: 'page-1' });
      pages.loadMemberPage.mockRejectedValue(new ForbiddenException());
      await expect(service.location('stranger', 'corr-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── getReview ────────────────────────────────────────────────────────────────
  describe('getReview', () => {
    // B10 (Fb-4): default compare = vN-1 ↔ vN (previous ↔ head), independent of any correction's
    // filedAgainstVersion.
    it('auto-picks from = head-1, to = head (vN-1 ↔ vN) regardless of correction filedAgainstVersion', async () => {
      prisma.correction.aggregate.mockResolvedValue({ _min: { filedAgainstVersion: 1 } }); // an older filed version
      const res = await service.getReview('acc-me', 'page-1', {});
      expect(res.selected).toMatchObject({ fromVersion: 2, toVersion: 3, surface: 'dessin' });
    });

    it('collapses to 1 ↔ 1 when the asset has a single version', async () => {
      prisma.assetPageLink.findMany.mockResolvedValue([
        { asset: { id: 'asset-dessin', filename: 'planche.png', type: 'dessin', currentVersion: 1 } },
      ]);
      prisma.assetVersion.findMany.mockResolvedValue([
        { version: 1, mediaId: 'media-1', note: null, createdAt: new Date('2026-07-14T09:00:00Z'), author: { displayName: 'Moi' } },
      ]);
      const res = await service.getReview('acc-me', 'page-1', {});
      expect(res.selected).toMatchObject({ fromVersion: 1, toVersion: 1 });
    });

    it('overrides from/to from the query', async () => {
      const res = await service.getReview('acc-me', 'page-1', { from: 2, to: 3 });
      expect(res.selected).toMatchObject({ fromVersion: 2, toVersion: 3 });
    });

    it('returns dessin image URLs for a dessin file', async () => {
      const res = await service.getReview('acc-me', 'page-1', { from: 2, to: 3 });
      expect(res.selected?.fromImageUrl).toBe('https://img/signed');
      expect(res.selected?.toImageUrl).toBe('https://img/signed');
      expect(res.selected?.fromHtml).toBeNull();
    });

    it('returns scenario HTML contents for a scenario file', async () => {
      prisma.assetPageLink.findMany.mockResolvedValue([
        { asset: { id: 'asset-scenario', filename: 'scenario.html', type: 'scenario', currentVersion: 3 } },
      ]);
      prisma.media.findUnique.mockResolvedValue({ id: 'm', bucketKey: 'k', contentType: 'text/html' });
      const res = await service.getReview('acc-me', 'page-1', { from: 2, to: 3 });
      expect(res.selected?.surface).toBe('scenario');
      expect(res.selected?.fromHtml).toContain('hello');
      expect(res.selected?.fromImageUrl).toBeNull();
    });

    // CS-5 security — the review payload must NEVER emit executable scenario HTML. In-app scenario HTML
    // is attacker-controlled (editor.getHTML(), any member can POST it), rendered via dangerouslySetInnerHTML
    // on the FE. The server sanitizes both compared versions through the allowlist sanitizer.
    it('sanitizes scenario version HTML (strips script/onerror) before returning it in selected.content', async () => {
      prisma.assetPageLink.findMany.mockResolvedValue([
        { asset: { id: 'asset-scenario', filename: 'scenario.html', type: 'scenario', currentVersion: 3 } },
      ]);
      prisma.media.findUnique.mockResolvedValue({ id: 'm', bucketKey: 'k', contentType: 'text/html' });
      s3.getObjectBuffer.mockResolvedValue(
        Buffer.from('<p><strong>ok</strong></p><script>alert(1)</script><img src=x onerror=alert(1)>'),
      );
      const res = await service.getReview('acc-me', 'page-1', { from: 2, to: 3 });
      const from = (res.selected?.fromHtml ?? '').toLowerCase();
      const to = (res.selected?.toHtml ?? '').toLowerCase();
      for (const html of [from, to]) {
        expect(html).not.toContain('<script');
        expect(html).not.toContain('onerror');
        expect(html).not.toContain('alert(1)');
      }
      expect(from).toContain('<strong>ok</strong>'); // safe formatting survives
    });

    // The per-version signed URLs existed only for the CS-24 crops, removed on user feedback
    // (2026-09-01) — the version list carries no url and signs only the selected pair.
    it('lists versions without per-version urls (only the selected pair is signed)', async () => {
      const res = await service.getReview('acc-me', 'page-1', { from: 2, to: 3 });
      expect(res.selected?.versions.every((v) => !('url' in v))).toBe(true);
      expect(prisma.assetVersion.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns selected = null when no reviewable file is linked', async () => {
      prisma.assetPageLink.findMany.mockResolvedValue([]);
      const res = await service.getReview('acc-me', 'page-1', {});
      expect(res.selected).toBeNull();
    });

    it('non-member blocked (loadMemberPage throws)', async () => {
      pages.loadMemberPage.mockRejectedValue(new ForbiddenException());
      await expect(service.getReview('stranger', 'page-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  // ── notifyNewVersion ─────────────────────────────────────────────────────────
  describe('notifyNewVersion', () => {
    it('notifies open-correction authors only, minus the actor', async () => {
      prisma.correction.findMany.mockResolvedValue([{ authorId: 'acc-yuki' }, { authorId: 'acc-me' }]);
      await service.notifyNewVersion('asset-dessin', 'acc-me');
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'acc-yuki' }));
      expect(notifications.create).not.toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'acc-me' }));
    });

    it('never throws when the notification fails', async () => {
      notifications.create.mockRejectedValue(new Error('down'));
      prisma.correction.findMany.mockResolvedValue([{ authorId: 'acc-yuki' }]);
      await expect(service.notifyNewVersion('asset-dessin', 'acc-me')).resolves.toBeUndefined();
    });
  });
});
