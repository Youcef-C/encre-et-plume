import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { chapterProgressPct, effectiveCoverPageId } from '@encre-et-plume/shared';
import { ChaptersService } from './chapters.service';
import { PagesService } from './pages.service';
import { PrismaService } from '../prisma/prisma.service';

// Owner acc-me (implicit full permissions), acc-yuki with « Écriture », acc-noa without it.
const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: {
    creators: [
      { accountId: 'acc-me', groupRole: 'leader', permissions: ['ecriture'] },
      { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture'] },
      { accountId: 'acc-noa', groupRole: 'member', permissions: ['corrections'] },
    ],
  },
  ...o,
});

const CHAPTER = (o: Record<string, unknown> = {}) => ({
  hasCover: true, // CS-6 — chapters open on a cover by default (the column default)
  id: 'ch-1',
  workId: 'work-1',
  number: 1,
  title: 'Prologue',
  resume: null,
  status: 'draft',
  likeCount: 12,
  // R3-2: every chapter has a planned length — the column is NOT NULL, defaulting to 20.
  targetPages: 20,
  ...o,
});

const PAGE = (o: Record<string, unknown> = {}) => ({
  id: 'page-1',
  projectId: 'proj-1',
  chapterId: 'ch-1',
  title: 'Page 1',
  stage: 'scenario',
  // R6-1a: the strip needs what a card IS — its tags, and its linked `page` asset's media.
  fileTags: [],
  assetLinks: [],
  ...o,
});

describe('ChaptersService', () => {
  let service: ChaptersService;
  let prisma: any;
  let assets: any;

  beforeEach(() => {
    // R6-1b: thumbnails are signed by CS-3's AssetsService — the ONE path — never re-derived here.
    assets = { thumbnailUrlsByMediaId: jest.fn().mockResolvedValue(new Map()) };
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(PROJECT()), findFirst: jest.fn().mockResolvedValue(PROJECT()) },
      chapter: {
        findUnique: jest.fn().mockResolvedValue(CHAPTER()),
        findFirst: jest.fn().mockResolvedValue(null), // no number collision by default
        findMany: jest.fn().mockResolvedValue([CHAPTER()]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...CHAPTER(), ...data })),
        aggregate: jest.fn().mockResolvedValue({ _max: { number: null } }),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...CHAPTER(), ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      page: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
      // R3-4: quick-create locks the work row, then a single INSERT … SELECT MAX(number)+1 … RETURNING.
      $queryRaw: jest.fn().mockResolvedValue([CHAPTER({ id: 'ch-new', number: 1, title: 'Chapitre 1' })]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new ChaptersService(prisma as unknown as PrismaService, assets);
  });

  // ── R3-3 · the ONE progress formula, shared by the API and the kanban board ──
  describe('chapterProgressPct (shared util)', () => {
    it('is 0 with nothing done, proportional in between, and clamps above the target', () => {
      expect(chapterProgressPct(0, 20)).toBe(0);
      expect(chapterProgressPct(5, 20)).toBe(25);
      expect(chapterProgressPct(20, 20)).toBe(100);
      expect(chapterProgressPct(30, 20)).toBe(100); // a chapter may overshoot its plan
    });
  });

  // ── list + derived fields ───────────────────────────────────────────────────
  describe('list', () => {
    it('maps published → "publie" and everything else → "en_cours", ordered by number', async () => {
      prisma.chapter.findMany.mockResolvedValue([
        CHAPTER({ id: 'ch-1', number: 0, status: 'published' }),
        CHAPTER({ id: 'ch-2', number: 1, status: 'draft' }),
      ]);
      const res = await service.list('acc-me', 'lames-de-brume');
      expect(res.chapters.map((c) => c.status)).toEqual(['publie', 'en_cours']);
      expect(prisma.chapter.findMany.mock.calls[0][0].orderBy).toEqual({ number: 'asc' });
      expect(res.canWrite).toBe(true);
    });

    it('derives plancheCount / progressPct from linked pages in ONE page query (no N+1)', async () => {
      // R2-7: the percentage is done ÷ TARGET (planches prévues), not done ÷ linked.
      prisma.chapter.findMany.mockResolvedValue([
        CHAPTER({ id: 'ch-1', targetPages: 4 }),
        CHAPTER({ id: 'ch-2', number: 2, targetPages: 2 }),
        CHAPTER({ id: 'ch-3', number: 3, targetPages: 8 }),
      ]);
      prisma.page.findMany.mockResolvedValue([
        PAGE({ id: 'p1', chapterId: 'ch-1', stage: 'valide' }),
        PAGE({ id: 'p2', chapterId: 'ch-1', stage: 'nemu' }),
        PAGE({ id: 'p3', chapterId: 'ch-2', stage: 'valide' }),
        PAGE({ id: 'p4', chapterId: 'ch-2', stage: 'valide' }),
      ]);
      const res = await service.list('acc-me', 'lames-de-brume');
      expect(prisma.page.findMany).toHaveBeenCalledTimes(1);
      expect(res.chapters[0]).toMatchObject({ plancheCount: 2, progressPct: 25 }); // 1 valide / 4 prévues
      expect(res.chapters[1]).toMatchObject({ plancheCount: 2, progressPct: 100 }); // 2 valide / 2 prévues
      expect(res.chapters[2]).toMatchObject({ plancheCount: 0, progressPct: 0, pages: [] });
      expect(res.chapters[0].pages).toEqual([
        { id: 'p1', title: 'Page 1', stage: 'valide', thumbnailUrl: null, fileTags: [] },
        { id: 'p2', title: 'Page 1', stage: 'nemu', thumbnailUrl: null, fileTags: [] },
      ]);
    });

    // ── R6-1 · the strip renders the linked page file, so the ref must carry it ──
    describe('ChapterPageRef (R6-1a)', () => {
      it("carries the linked page asset's thumbnail URL and the card's fileTags", async () => {
        prisma.page.findMany.mockResolvedValue([
          PAGE({ id: 'p1', fileTags: ['double'], assetLinks: [{ asset: { mediaId: 'med-1' } }] }),
          PAGE({ id: 'p2', fileTags: ['nemu'] }), // no page asset linked
        ]);
        assets.thumbnailUrlsByMediaId.mockResolvedValue(new Map([['med-1', 'https://cdn.test/thumb-1.webp']]));

        const res = await service.list('acc-me', 'lames-de-brume');
        expect(res.chapters[0].pages).toEqual([
          { id: 'p1', title: 'Page 1', stage: 'scenario', thumbnailUrl: 'https://cdn.test/thumb-1.webp', fileTags: ['double'] },
          { id: 'p2', title: 'Page 1', stage: 'scenario', thumbnailUrl: null, fileTags: ['nemu'] },
        ]);
        // R6-1b: signing goes through CS-3's ONE path, never a second one wired here.
        expect(assets.thumbnailUrlsByMediaId).toHaveBeenCalledWith(['med-1']);
      });

      it('yields a null thumbnail when the linked media has no thumb variant', async () => {
        prisma.page.findMany.mockResolvedValue([PAGE({ id: 'p1', assetLinks: [{ asset: { mediaId: 'med-1' } }] })]);
        assets.thumbnailUrlsByMediaId.mockResolvedValue(new Map([['med-1', null]]));
        const res = await service.list('acc-me', 'lames-de-brume');
        expect(res.chapters[0].pages[0].thumbnailUrl).toBeNull();
      });

      it('resolves every chapter\'s thumbnails in ONE lookup (no N+1 across chapters)', async () => {
        prisma.chapter.findMany.mockResolvedValue([
          CHAPTER({ id: 'ch-1' }),
          CHAPTER({ id: 'ch-2', number: 2 }),
          CHAPTER({ id: 'ch-3', number: 3 }),
        ]);
        prisma.page.findMany.mockResolvedValue([
          PAGE({ id: 'p1', chapterId: 'ch-1', assetLinks: [{ asset: { mediaId: 'med-1' } }] }),
          PAGE({ id: 'p2', chapterId: 'ch-2', assetLinks: [{ asset: { mediaId: 'med-2' } }] }),
          PAGE({ id: 'p3', chapterId: 'ch-3', assetLinks: [{ asset: { mediaId: 'med-3' } }] }),
        ]);
        assets.thumbnailUrlsByMediaId.mockResolvedValue(new Map([['med-1', 'u1'], ['med-2', 'u2'], ['med-3', 'u3']]));

        const res = await service.list('acc-me', 'lames-de-brume');
        expect(prisma.page.findMany).toHaveBeenCalledTimes(1);
        expect(assets.thumbnailUrlsByMediaId).toHaveBeenCalledTimes(1);
        expect(res.chapters.map((c) => c.pages[0].thumbnailUrl)).toEqual(['u1', 'u2', 'u3']);
      });

      it('asks the DB only for `page`-type asset links (the strip is planches, not scenarios)', async () => {
        await service.list('acc-me', 'lames-de-brume');
        const select = prisma.page.findMany.mock.calls[0][0].select;
        expect(select.fileTags).toBe(true);
        expect(select.assetLinks.where).toEqual({ asset: { type: 'page' } });
      });

      it('skips the media lookup entirely when no card links a page asset', async () => {
        prisma.page.findMany.mockResolvedValue([PAGE({ id: 'p1' })]);
        await service.list('acc-me', 'lames-de-brume');
        expect(assets.thumbnailUrlsByMediaId).not.toHaveBeenCalled();
      });
    });

    // ── R3-2 · every chapter has a target, so every chapter has a percentage ──
    it('always reports a percentage — a chapter nobody planned by hand still has the default 20', async () => {
      prisma.chapter.findMany.mockResolvedValue([CHAPTER({ id: 'ch-1', targetPages: 20 })]);
      prisma.page.findMany.mockResolvedValue([PAGE({ id: 'p1', chapterId: 'ch-1', stage: 'valide' })]);
      const res = await service.list('acc-me', 'lames-de-brume');
      expect(res.chapters[0]).toMatchObject({ targetPages: 20, plancheCount: 1, progressPct: 5 });
    });

    it('clamps to 100 % when more pages are done than planned', async () => {
      prisma.chapter.findMany.mockResolvedValue([CHAPTER({ id: 'ch-1', targetPages: 2 })]);
      prisma.page.findMany.mockResolvedValue([
        PAGE({ id: 'p1', chapterId: 'ch-1', stage: 'valide' }),
        PAGE({ id: 'p2', chapterId: 'ch-1', stage: 'valide' }),
        PAGE({ id: 'p3', chapterId: 'ch-1', stage: 'valide' }),
      ]);
      const res = await service.list('acc-me', 'lames-de-brume');
      expect(res.chapters[0].progressPct).toBe(100);
    });

    it('reports canWrite=false for a member without « Écriture »', async () => {
      const res = await service.list('acc-noa', 'lames-de-brume');
      expect(res.canWrite).toBe(false);
    });

    it('rejects a non-member (private project → 404, no leak)', async () => {
      await expect(service.list('acc-stranger', 'lames-de-brume')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates the chapter with title/number/resume on the project work', async () => {
      const res = await service.create('acc-yuki', 'lames-de-brume', { title: 'Ch. 1', number: 1, resume: 'Sous la pluie' });
      expect(prisma.chapter.create.mock.calls[0][0].data).toMatchObject({
        workId: 'work-1',
        title: 'Ch. 1',
        number: 1,
        resume: 'Sous la pluie',
        status: 'draft',
      });
      expect(res.title).toBe('Ch. 1');
    });

    it('409s when the number is already used in this project', async () => {
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER({ id: 'ch-other', number: 1 }));
      await expect(service.create('acc-me', 'lames-de-brume', { title: 'Ch. 1', number: 1 })).rejects.toThrow(ConflictException);
      expect(prisma.chapter.create).not.toHaveBeenCalled();
    });

    it('400s on a blank title or a non-integer number', async () => {
      await expect(service.create('acc-me', 'lames-de-brume', { title: '   ', number: 1 })).rejects.toThrow(BadRequestException);
      await expect(service.create('acc-me', 'lames-de-brume', { title: 'Ch', number: 1.5 })).rejects.toThrow(BadRequestException);
    });

    it('403s a member without « Écriture »', async () => {
      await expect(service.create('acc-noa', 'lames-de-brume', { title: 'Ch', number: 4 })).rejects.toThrow(ForbiddenException);
    });

    it('stores « planches prévues » and 400s a non-positive target (R2-7)', async () => {
      await service.create('acc-yuki', 'lames-de-brume', { title: 'Ch. 1', number: 1, targetPages: 18 });
      expect(prisma.chapter.create.mock.calls[0][0].data).toMatchObject({ targetPages: 18 });
      await expect(service.create('acc-yuki', 'lames-de-brume', { title: 'Ch', number: 2, targetPages: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.create('acc-yuki', 'lames-de-brume', { title: 'Ch', number: 2, targetPages: 2.5 })).rejects.toThrow(BadRequestException);
    });

    // R3-2: the target is no longer optional data — omitting it means "the standard 20 planches".
    it('defaults « planches prévues » to 20 when none is given', async () => {
      await service.create('acc-yuki', 'lames-de-brume', { title: 'Ch. 1', number: 1 });
      expect(prisma.chapter.create.mock.calls[0][0].data).toMatchObject({ targetPages: 20 });
    });

    // ── R2-2 quick-create (the Tableau "＋" chip), R3-4 raced-proof ─────────
    describe('quick-create (number omitted)', () => {
      /** A single-statement `INSERT … SELECT MAX(number)+1`: the number is picked AT WRITE TIME, so
       *  no interleaving can hand two callers the same one. Models the DB, not the service. */
      function fakeAtomicInsert() {
        let max = 0;
        prisma.$queryRaw.mockImplementation(async () => {
          const number = ++max;
          return [CHAPTER({ id: `ch-${number}`, number, title: `Chapitre ${number}` })];
        });
      }

      it('computes the next number INSIDE the insert — no read-then-write window', async () => {
        prisma.$queryRaw.mockResolvedValue([CHAPTER({ id: 'ch-7', number: 7, title: 'Chapitre 7' })]);
        const res = await service.create('acc-yuki', 'lames-de-brume', {});
        // The max is read by the DB as part of the write, never by us beforehand.
        expect(prisma.chapter.aggregate).not.toHaveBeenCalled();
        expect(prisma.chapter.create).not.toHaveBeenCalled();
        const sql = (prisma.$queryRaw.mock.calls[0][0] as string[]).join(' ');
        expect(sql).toMatch(/INSERT INTO "Chapter"/i);
        expect(sql).toMatch(/COALESCE\(MAX\("number"\), *0\) *\+ *1/i);
        expect(res.number).toBe(7);
      });

      // Measured, not assumed: the in-statement MAX alone is NOT enough. Under READ COMMITTED every
      // concurrent statement reads the same committed max, so 8/16/25 simultaneous creates still lost
      // (7/8, 13/16 against the local DB). Serializing on the work row fixed it (25/25, 36 ms).
      it('serializes on the work row so concurrent statements cannot read the same MAX', async () => {
        await service.create('acc-yuki', 'lames-de-brume', {});
        expect(prisma.$transaction).toHaveBeenCalled();
        const lock = (prisma.$executeRaw.mock.calls[0][0] as string[]).join(' ');
        expect(lock).toMatch(/FROM "Work" WHERE id = .* FOR UPDATE/i);
        // …and the lock is taken BEFORE the insert, or it serializes nothing.
        expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.$queryRaw.mock.invocationCallOrder[0]);
      });

      it('gives the first chapter of a project number 1 and titles it « Chapitre 1 »', async () => {
        fakeAtomicInsert();
        const res = await service.create('acc-yuki', 'lames-de-brume', {});
        expect(res).toMatchObject({ number: 1, title: 'Chapitre 1' });
      });

      // A RAW query does not report P2002 — Prisma wraps it as P2010 with the Postgres SQLSTATE in
      // `meta.code` (verified live against the local DB). Recognising only P2002 would rethrow every
      // residual collision straight into the 500 R3-4 exists to remove.
      it('retries the residual collision instead of failing', async () => {
        prisma.$queryRaw
          .mockRejectedValueOnce(Object.assign(new Error('raw failed'), { code: 'P2010', meta: { code: '23505' } }))
          .mockResolvedValueOnce([CHAPTER({ id: 'ch-5', number: 5 })]);
        const res = await service.create('acc-yuki', 'lames-de-brume', {});
        expect(res.number).toBe(5);
      });

      it('rethrows a raw-query failure that is NOT a unique collision', async () => {
        prisma.$queryRaw.mockRejectedValue(Object.assign(new Error('boom'), { code: 'P2010', meta: { code: '42703' } }));
        await expect(service.create('acc-yuki', 'lames-de-brume', {})).rejects.toThrow('boom');
      });

      // R3-4 (round-2 QA FAIL): the raw unique error used to escape as an unhandled 500 from a click.
      it('never leaks a raw Prisma error — an exhausted retry is a mapped 503', async () => {
        prisma.$queryRaw.mockRejectedValue(Object.assign(new Error('raw failed'), { code: 'P2010', meta: { code: '23505' } }));
        const err = await service.create('acc-yuki', 'lames-de-brume', {}).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect((err as { code?: string }).code).toBeUndefined();
      });

      it.each([8, 10])('gives %i simultaneous quick-creates distinct numbers, none failing', async (n) => {
        fakeAtomicInsert();
        const created = await Promise.all(
          Array.from({ length: n }, () => service.create('acc-yuki', 'lames-de-brume', {})),
        );
        expect(new Set(created.map((c) => c.number)).size).toBe(n);
      });

      it('still 403s a member without « Écriture »', async () => {
        await expect(service.create('acc-noa', 'lames-de-brume', {})).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('renumbers to a free number', async () => {
      const res = await service.update('acc-yuki', 'ch-1', { number: 7 });
      expect(prisma.chapter.update.mock.calls[0][0].data).toEqual({ number: 7 });
      expect(res.number).toBe(7);
    });

    it('409s when the target number belongs to another chapter', async () => {
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER({ id: 'ch-other', number: 7 }));
      await expect(service.update('acc-me', 'ch-1', { number: 7 })).rejects.toThrow(ConflictException);
    });

    it('keeps 200 when the "collision" is the chapter itself', async () => {
      prisma.chapter.findFirst.mockResolvedValue(CHAPTER({ id: 'ch-1', number: 1 }));
      await expect(service.update('acc-me', 'ch-1', { number: 1, title: 'Renommé' })).resolves.toMatchObject({ title: 'Renommé' });
    });

    it('sets « planches prévues », and refuses to clear it (R3-2)', async () => {
      await service.update('acc-yuki', 'ch-1', { targetPages: 24 });
      expect(prisma.chapter.update.mock.calls[0][0].data).toEqual({ targetPages: 24 });
      // R3-2 reverses R2-7's clear-to-null: the column is NOT NULL, so there is nothing to clear to.
      await expect(service.update('acc-yuki', 'ch-1', { targetPages: null })).rejects.toThrow(BadRequestException);
      await expect(service.update('acc-yuki', 'ch-1', { targetPages: -3 })).rejects.toThrow(BadRequestException);
    });

    it('404s an unknown chapter and 403s a member without « Écriture »', async () => {
      prisma.chapter.findUnique.mockResolvedValue(null);
      await expect(service.update('acc-me', 'nope', { title: 'x' })).rejects.toThrow(NotFoundException);
      prisma.chapter.findUnique.mockResolvedValue(CHAPTER());
      await expect(service.update('acc-noa', 'ch-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('deletes an EMPTY chapter', async () => {
      prisma.page.count.mockResolvedValue(0);
      await service.remove('acc-yuki', 'ch-1');
      expect(prisma.chapter.delete).toHaveBeenCalledWith({ where: { id: 'ch-1' } });
    });

    // R2-6: never destroy a member's cards, and never orphan them (R2-1d) — the user empties the
    // chapter first (moving the cards with R2-5, or deleting them).
    it('409s while the chapter still holds cards, and touches nothing', async () => {
      prisma.page.count.mockResolvedValue(3);
      await expect(service.remove('acc-yuki', 'ch-1')).rejects.toThrow(ConflictException);
      await expect(service.remove('acc-yuki', 'ch-1')).rejects.toThrow(/3 cartes/);
      expect(prisma.chapter.delete).not.toHaveBeenCalled();
      expect(prisma.page.updateMany).not.toHaveBeenCalled();
    });

    it('409s on a published chapter and leaves it alone', async () => {
      prisma.chapter.findUnique.mockResolvedValue(CHAPTER({ status: 'published' }));
      await expect(service.remove('acc-me', 'ch-1')).rejects.toThrow(ConflictException);
      expect(prisma.chapter.delete).not.toHaveBeenCalled();
    });

    it('404s an unknown chapter, 403s a member without « Écriture »', async () => {
      prisma.chapter.findUnique.mockResolvedValue(null);
      await expect(service.remove('acc-me', 'nope')).rejects.toThrow(NotFoundException);
      prisma.chapter.findUnique.mockResolvedValue(CHAPTER());
      await expect(service.remove('acc-noa', 'ch-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── CS-6 · « Réorganiser les pages » ────────────────────────────────────────
  // ── CS-6 · the « Couverture » toggle ────────────────────────────────────────
  // A field on the chapter, not a resource: it rides the ordinary PATCH /chapters/:id. The cover
  // itself is positional (the first page), so there is nothing else to store.
  describe('CS-6 hasCover', () => {
    it('turns the cover off and back on through the ordinary chapter PATCH', async () => {
      prisma.chapter.update.mockResolvedValue(CHAPTER({ hasCover: false }));
      const off = await service.update('acc-yuki', 'ch-1', { hasCover: false });
      expect(prisma.chapter.update.mock.calls[0][0].data).toEqual({ hasCover: false });
      expect(off.hasCover).toBe(false);

      prisma.chapter.update.mockResolvedValue(CHAPTER({ hasCover: true }));
      const on = await service.update('acc-yuki', 'ch-1', { hasCover: true });
      expect(on.hasCover).toBe(true);
    });

    it('is left alone when the PATCH does not mention it', async () => {
      await service.update('acc-yuki', 'ch-1', { title: 'Nouveau titre' });
      expect(prisma.chapter.update.mock.calls[0][0].data).not.toHaveProperty('hasCover');
    });

    it('403s a member without « Écriture » (same gate as every chapter write)', async () => {
      await expect(service.update('acc-noa', 'ch-1', { hasCover: false })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('CS-6 reorderPages', () => {
    /**
     * A tiny in-memory Page table. The service RE-READS the chapter's cards to build its response,
     * so the writes must be visible to that re-read — that is what proves the returned DTO is server
     * truth and the slots ended dense, rather than an echo of the request.
     */
    type StoreRow = { id: string; position: number; chapterId: string; fileTags: string[] };
    function seedPages(rows: { id: string; position: number; fileTags?: string[] }[]): StoreRow[] {
      const store = rows.map(
        (r) => PAGE({ id: r.id, position: r.position, fileTags: r.fileTags ?? [] }) as unknown as StoreRow,
      );
      prisma.page.findMany.mockImplementation(async () => [...store].sort((a, b) => a.position - b.position));
      prisma.page.update.mockImplementation(async ({ where, data }: any) => {
        const row = store.find((p) => p.id === where.id);
        return row ? Object.assign(row, data) : null;
      });
      return store;
    }

    it('rewrites `position` to a dense 0..n-1 in the payload order', async () => {
      const store = seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }, { id: 'p3', position: 2 }]);
      const res = await service.reorderPages('acc-yuki', 'ch-1', { pageIds: ['p3', 'p1', 'p2'] });
      expect(store.map((p) => [p.id, p.position])).toEqual([['p1', 1], ['p2', 2], ['p3', 0]]);
      // …and the answer is the refreshed chapter, read back in the new slot order.
      expect(res.pages.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
      expect(res.pages.map((p) => p.position)).toEqual([0, 1, 2]);
    });

    it('writes only the cards that actually moved', async () => {
      seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }, { id: 'p3', position: 2 }]);
      await service.reorderPages('acc-yuki', 'ch-1', { pageIds: ['p1', 'p3', 'p2'] });
      expect(prisma.page.update).toHaveBeenCalledTimes(2); // p1 already sits at slot 0
    });

    it('runs the renumbering in ONE transaction (a half-applied order is not a state)', async () => {
      seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }]);
      await service.reorderPages('acc-yuki', 'ch-1', { pageIds: ['p2', 'p1'] });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    // The payload is a COMPLETE permutation, never a delta — this is what makes the story's
    // "order must remain contiguous" true by construction against a stale grid.
    it.each([
      ['a missing id', ['p1', 'p2']],
      ['a duplicate id', ['p1', 'p2', 'p2']],
      ['a page from another chapter', ['p1', 'p2', 'p9']],
      ['an empty list', []],
    ])('400s on %s', async (_label, pageIds) => {
      seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }, { id: 'p3', position: 2 }]);
      await expect(service.reorderPages('acc-yuki', 'ch-1', { pageIds })).rejects.toThrow(BadRequestException);
      await expect(service.reorderPages('acc-yuki', 'ch-1', { pageIds })).rejects.toThrow(/ordre des pages est invalide/);
      expect(prisma.page.update).not.toHaveBeenCalled();
    });

    it('403s a member without « Écriture », 404s a non-member and an unknown chapter', async () => {
      seedPages([{ id: 'p1', position: 0 }]);
      await expect(service.reorderPages('acc-noa', 'ch-1', { pageIds: ['p1'] })).rejects.toThrow(ForbiddenException);
      await expect(service.reorderPages('acc-stranger', 'ch-1', { pageIds: ['p1'] })).rejects.toThrow(NotFoundException);
      prisma.chapter.findUnique.mockResolvedValue(null);
      await expect(service.reorderPages('acc-me', 'nope', { pageIds: ['p1'] })).rejects.toThrow(NotFoundException);
    });

    // The cover is "whatever opens the chapter" (user, 2026-08-01) — purely positional, so a reorder
    // re-designates it by definition and there is nothing to store. The chapter row is never touched.
    it('re-designates the cover by moving the pages, writing nothing to the chapter', async () => {
      seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }]);
      const res = await service.reorderPages('acc-yuki', 'ch-1', { pageIds: ['p2', 'p1'] });
      expect(prisma.chapter.update).not.toHaveBeenCalled();
      expect(effectiveCoverPageId(res)).toBe('p2');
    });

    // The §3-B1 drift risk, pinned: CS-7's per-card `PATCH /pages/:id { position }` and CS-6's
    // whole-permutation route BOTH write `Page.position`. Run one after the other on the same table
    // and the slots must still be dense 0..n-1.
    it('stays dense after CS-7 moves ONE card and CS-6 then rewrites the whole order', async () => {
      const store = seedPages([{ id: 'p1', position: 0 }, { id: 'p2', position: 1 }, { id: 'p3', position: 2 }]);
      prisma.page.findUnique.mockImplementation(async ({ where }: any) => {
        const row = store.find((p) => p.id === where.id);
        return row ? { ...row, project: PROJECT(), assignees: [], createdById: 'acc-yuki' } : null;
      });
      const pages = new PagesService(prisma as unknown as PrismaService, { create: jest.fn() } as never);

      await pages.updatePage('acc-yuki', 'p3', { position: 1 }); // CS-7 path: p3 to slot 0 (1-based)
      expect(sortedPositions(store)).toEqual([0, 1, 2]);

      await service.reorderPages('acc-yuki', 'ch-1', { pageIds: ['p2', 'p1', 'p3'] }); // CS-6 path
      expect(sortedPositions(store)).toEqual([0, 1, 2]);
      expect(store.find((p) => p.id === 'p2')?.position).toBe(0);
    });

    function sortedPositions(store: StoreRow[]): number[] {
      return store.map((p) => p.position).sort((a, b) => a - b);
    }
  });
});
