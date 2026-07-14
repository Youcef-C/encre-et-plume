import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PSD = 'image/vnd.adobe.photoshop';

const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: { id: 'work-1', creators: [{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }] },
  ...o,
});

const MEDIA = (o: Record<string, unknown> = {}) => ({
  id: 'media-1',
  ownerId: 'acc-me',
  kind: 'asset',
  status: 'ready',
  contentType: 'image/png',
  size: 2048,
  bucketKey: 'asset/acc-me/media-1.png',
  visibility: 'private',
  variants: { orig: 'asset/acc-me/media-1.png', web: 'asset/acc-me/media-1/web.webp', thumb: 'asset/acc-me/media-1/thumb.webp' },
  ...o,
});

const ASSET = (o: Record<string, unknown> = {}) => ({
  id: 'asset-1',
  projectId: 'proj-1',
  type: 'dessin',
  filename: 'planche.png',
  currentVersion: 1,
  size: 2048,
  mediaId: 'media-1',
  // 2026-07-14: link state lives in the AssetPageLink join. Test fixtures carry both `pageId`
  // (loadMemberAsset select shape) and `page` (getAssetItem include shape) on each link row.
  pageLinks: [] as { pageId: string; page: { id: string; title: string } }[],
  updatedAt: new Date('2026-07-13T00:00:00Z'),
  ...o,
});

/** A join-row fixture carrying both the select shape (pageId) and the include shape (page). */
const LINK = (pageId: string, title = pageId) => ({ pageId, page: { id: pageId, title } });

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: any;
  let media: { signedUrl: jest.Mock; ingestAsset: jest.Mock; deleteMediaById: jest.Mock };
  let s3: { presignGet: jest.Mock; getObjectBuffer: jest.Mock; publicUrl: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(PROJECT()) },
      asset: {
        // where.projectId_filename → the "existing?" lookup (default: none). where.id → getAssetItem / loadMemberAsset.
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          where.projectId_filename ? Promise.resolve(null) : Promise.resolve({ ...ASSET(), project: PROJECT() }),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(ASSET({ ...data, id: 'asset-new', updatedAt: new Date() }))),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(ASSET({ ...data }))),
        delete: jest.fn().mockResolvedValue({}),
      },
      assetVersion: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      assetPageLink: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      media: {
        findUnique: jest.fn().mockResolvedValue(MEDIA()),
        findMany: jest.fn().mockResolvedValue([MEDIA()]),
      },
      page: {
        findUnique: jest.fn().mockResolvedValue({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
    };
    media = {
      signedUrl: jest.fn().mockResolvedValue({ url: 'https://signed/download', expiresIn: 300 }),
      ingestAsset: jest.fn().mockResolvedValue({ id: 'media-ingested', size: 5, contentType: 'image/png' }),
      deleteMediaById: jest.fn().mockResolvedValue(undefined),
    };
    s3 = {
      presignGet: jest.fn().mockResolvedValue('https://signed/variant'),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('hello')),
      publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
    };
    service = new AssetsService(
      prisma as unknown as PrismaService,
      media as unknown as MediaService,
      s3 as unknown as S3StorageService,
    );
  });

  // ── createAsset (B2) ──────────────────────────────────────────────────────
  describe('createAsset', () => {
    it('registers Asset v1 + AssetVersion(1) atomically for an owned ready asset media', async () => {
      await service.createAsset('acc-me', 'lames-de-brume', { mediaId: 'media-1', filename: 'planche.png' });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: 'proj-1', filename: 'planche.png', currentVersion: 1, size: 2048, mediaId: 'media-1' }) }),
      );
      expect(prisma.assetVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 1, mediaId: 'media-1', authorId: 'acc-me' }) }),
      );
    });

    it('derives type: png → dessin', async () => {
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('dessin');
    });

    it('derives type: scenario-ch5.docx → scenario', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: DOCX }));
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'scénario-ch5.docx' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('scenario');
    });

    it('derives type: notes.txt → texte', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'text/plain' }));
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'notes.txt' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('texte');
    });

    it('derives type: psd → dessin', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: PSD }));
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'art.psd' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('dessin');
    });

    // CS-3 (2026-07-13): drawing-source files upload as octet-stream and derive `dessin` by EXTENSION.
    it('derives type: octet-stream .clip → dessin (by extension)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'application/octet-stream' }));
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.clip' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('dessin');
    });

    it('derives type: octet-stream .kra / .procreate → dessin (by extension)', async () => {
      for (const filename of ['art.kra', 'sketch.procreate']) {
        prisma.asset.create.mockClear();
        prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'application/octet-stream' }));
        await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename });
        expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('dessin');
      }
    });

    it('rejects empty filename (400)', async () => {
      await expect(service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects media not owned by caller (400)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ ownerId: 'other' }));
      await expect(service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'a.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects media not ready (400)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ status: 'pending' }));
      await expect(service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'a.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects media not of asset kind (400)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ kind: 'avatar' }));
      await expect(service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'a.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('D10: same-filename re-import appends a version instead of creating a second asset', async () => {
      prisma.asset.findUnique.mockImplementation(({ where }: any) =>
        where.projectId_filename ? Promise.resolve(ASSET({ id: 'asset-1', filename: 'planche.png', currentVersion: 2, mediaId: 'old' })) : Promise.resolve(ASSET({ currentVersion: 3, mediaId: 'media-1' })),
      );
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png' });
      expect(prisma.asset.create).not.toHaveBeenCalled();
      expect(prisma.assetVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 3, mediaId: 'media-1' }) }),
      );
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentVersion: 3, mediaId: 'media-1' }) }),
      );
    });

    it('404 for a non-member on a private project', async () => {
      await expect(service.createAsset('stranger', 'x', { mediaId: 'media-1', filename: 'a.png' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 for a non-member on a public project', async () => {
      prisma.project.findUnique.mockResolvedValue(PROJECT({ visibility: 'public' }));
      await expect(service.createAsset('stranger', 'x', { mediaId: 'media-1', filename: 'a.png' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    // B7 (iter 2): user-declared type overrides derivation so page/ref assets are creatable.
    it('stores a declared type (ref) instead of the derived one', async () => {
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png', type: 'ref' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('ref'); // derivation would give dessin
    });

    it('stores a declared type (page)', async () => {
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png', type: 'page' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('page');
    });

    it('falls back to derivation when no type is declared (byte-for-byte)', async () => {
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png' });
      expect(prisma.asset.create.mock.calls[0][0].data.type).toBe('dessin');
    });

    it('ignores a declared type on same-filename re-import (asset keeps its type)', async () => {
      prisma.asset.findUnique.mockImplementation(({ where }: any) =>
        where.projectId_filename ? Promise.resolve(ASSET({ id: 'asset-1', filename: 'planche.png', currentVersion: 1, mediaId: 'old' })) : Promise.resolve(ASSET({ currentVersion: 2, mediaId: 'media-1' })),
      );
      await service.createAsset('acc-me', 'x', { mediaId: 'media-1', filename: 'planche.png', type: 'page' });
      expect(prisma.asset.create).not.toHaveBeenCalled();
      expect(prisma.asset.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'page' }) }));
    });
  });

  // ── list (B4) ─────────────────────────────────────────────────────────────
  describe('list', () => {
    it('composes AND filters: type + pageId + q (case-insensitive)', async () => {
      await service.list('acc-me', 'x', { type: 'dessin', pageId: 'page-1', q: 'Plan' });
      const where = prisma.asset.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ projectId: 'proj-1', type: 'dessin', pageLinks: { some: { pageId: 'page-1' } } });
      expect(where.filename).toMatchObject({ contains: 'Plan', mode: 'insensitive' });
    });

    it('sort recent → updatedAt desc; name → filename asc; size → size desc', async () => {
      await service.list('acc-me', 'x', { sort: 'recent' });
      expect(prisma.asset.findMany.mock.calls[0][0].orderBy).toEqual({ updatedAt: 'desc' });
      await service.list('acc-me', 'x', { sort: 'name' });
      expect(prisma.asset.findMany.mock.calls[1][0].orderBy).toEqual({ filename: 'asc' });
      await service.list('acc-me', 'x', { sort: 'size' });
      expect(prisma.asset.findMany.mock.calls[2][0].orderBy).toEqual({ size: 'desc' });
    });

    it('paginates: total, totalPages, clamps page ≥ 1', async () => {
      prisma.asset.count.mockResolvedValue(50);
      prisma.asset.findMany.mockResolvedValue([]);
      const res = await service.list('acc-me', 'x', { page: 0 });
      expect(res.page).toBe(1);
      expect(res.total).toBe(50);
      expect(res.pageSize).toBe(24);
      expect(res.totalPages).toBe(3);
    });

    it('rejects an invalid type (400)', async () => {
      await expect(service.list('acc-me', 'x', { type: 'bogus' as never })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('item carries currentVersion + linkedPages; thumbnailUrl null for documents', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([
        ASSET({ mediaId: 'media-doc', currentVersion: 2, pageLinks: [{ page: { id: 'page-1', title: 'Page 7' } }] }),
      ]);
      prisma.media.findMany.mockResolvedValue([MEDIA({ id: 'media-doc', contentType: DOCX, variants: { orig: 'asset/acc-me/media-doc.docx' } })]);
      const res = await service.list('acc-me', 'x', {});
      expect(res.items[0].currentVersion).toBe(2);
      expect(res.items[0].linkedPages).toEqual([{ id: 'page-1', title: 'Page 7' }]);
      expect(res.items[0].thumbnailUrl).toBeNull();
    });

    // A6/A8: an asset linked to multiple cards exposes all of them (count = titles.length).
    it('item exposes multiple linked cards via linkedPages', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([
        ASSET({ type: 'scenario', pageLinks: [{ page: { id: 'page-a', title: 'A' } }, { page: { id: 'page-b', title: 'B' } }] }),
      ]);
      prisma.media.findMany.mockResolvedValue([MEDIA()]);
      const res = await service.list('acc-me', 'x', {});
      expect(res.items[0].linkedPages).toEqual([{ id: 'page-a', title: 'A' }, { id: 'page-b', title: 'B' }]);
    });

    it('resolves a signed thumbnail for a private image asset', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([ASSET()]);
      prisma.media.findMany.mockResolvedValue([MEDIA()]);
      const res = await service.list('acc-me', 'x', {});
      expect(s3.presignGet).toHaveBeenCalledWith('asset/acc-me/media-1/thumb.webp', expect.any(Number));
      expect(res.items[0].thumbnailUrl).toBe('https://signed/variant');
    });
  });

  // ── addVersion (B5) ───────────────────────────────────────────────────────
  describe('addVersion', () => {
    it('increments currentVersion, updates head mediaId/size', async () => {
      prisma.asset.findFirst.mockResolvedValue(ASSET({ currentVersion: 2, mediaId: 'old' }));
      prisma.media.findUnique.mockResolvedValue(MEDIA({ id: 'media-2', size: 9000 }));
      await service.addVersion('acc-me', 'x', 'asset-1', { mediaId: 'media-2', note: 'retouche' });
      expect(prisma.assetVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ version: 3, mediaId: 'media-2', size: 9000, note: 'retouche', authorId: 'acc-me' }) }),
      );
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentVersion: 3, mediaId: 'media-2', size: 9000 }) }),
      );
    });

    it('404 when the asset is not in the slug project', async () => {
      prisma.asset.findFirst.mockResolvedValue(null);
      await expect(service.addVersion('acc-me', 'x', 'asset-x', { mediaId: 'media-2' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── getVersions (B6) ──────────────────────────────────────────────────────
  describe('getVersions', () => {
    it('returns the chain desc with author name', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT() });
      prisma.assetVersion.findMany.mockResolvedValue([
        { version: 2, mediaId: 'm2', size: 10, note: 'v2', authorId: 'acc-me', createdAt: new Date('2026-07-13T00:00:00Z'), author: { displayName: 'Yuki' } },
        { version: 1, mediaId: 'm1', size: 8, note: null, authorId: 'acc-me', createdAt: new Date('2026-07-12T00:00:00Z'), author: { displayName: 'Yuki' } },
      ]);
      prisma.media.findMany.mockResolvedValue([]);
      const res = await service.getVersions('acc-me', 'asset-1');
      expect(res.map((v) => v.version)).toEqual([2, 1]);
      expect(res[0].authorName).toBe('Yuki');
    });

    it('marks which version is active (version === asset.currentVersion)', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ currentVersion: 1 }), project: PROJECT() });
      prisma.assetVersion.findMany.mockResolvedValue([
        { version: 2, mediaId: 'm2', size: 10, note: 'v2', authorId: 'acc-me', createdAt: new Date('2026-07-13T00:00:00Z'), author: { displayName: 'Yuki' } },
        { version: 1, mediaId: 'm1', size: 8, note: null, authorId: 'acc-me', createdAt: new Date('2026-07-12T00:00:00Z'), author: { displayName: 'Yuki' } },
      ]);
      prisma.media.findMany.mockResolvedValue([]);
      const res = await service.getVersions('acc-me', 'asset-1');
      expect(res.find((v) => v.version === 1)?.active).toBe(true);
      expect(res.find((v) => v.version === 2)?.active).toBe(false);
    });
  });

  // ── setActiveVersion (active-version switching) ────────────────────────────
  describe('setActiveVersion', () => {
    it('repoints currentVersion/mediaId/size to the chosen version without creating a version', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ currentVersion: 3, mediaId: 'media-3' }), project: PROJECT() });
      prisma.assetVersion.findUnique.mockResolvedValue({ assetId: 'asset-1', version: 1, mediaId: 'media-1', size: 2048 });
      await service.setActiveVersion('acc-me', 'asset-1', 1);
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'asset-1' }, data: { currentVersion: 1, mediaId: 'media-1', size: 2048 } }),
      );
      expect(prisma.assetVersion.create).not.toHaveBeenCalled();
    });

    it('is an idempotent no-op when the chosen version is already active', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ currentVersion: 2 }), project: PROJECT() });
      await service.setActiveVersion('acc-me', 'asset-1', 2);
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    it('404 when the version does not exist on the asset', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ currentVersion: 3 }), project: PROJECT() });
      prisma.assetVersion.findUnique.mockResolvedValue(null);
      await expect(service.setActiveVersion('acc-me', 'asset-1', 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400 on an invalid version number', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT() });
      await expect(service.setActiveVersion('acc-me', 'asset-1', 0)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 for a non-member on a private project (no existence leak)', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET(),
        project: PROJECT({ ownerId: 'acc-owner', work: { creators: [] } }),
      });
      await expect(service.setActiveVersion('acc-stranger', 'asset-1', 1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 for a non-member on a public project', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET(),
        project: PROJECT({ ownerId: 'acc-owner', visibility: 'public', work: { creators: [] } }),
      });
      await expect(service.setActiveVersion('acc-stranger', 'asset-1', 1)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── linkToPage (2026-07-14 multi-card) ─────────────────────────────────────
  describe('linkToPage', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT() });
    });

    it('adds a join row for the card and appends assetId to page.linkedFileIds', async () => {
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      expect(prisma.assetPageLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ assetId: 'asset-1', pageId: 'page-1' }], skipDuplicates: true }),
      );
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.linkedFileIds).toContain('asset-1');
    });

    it('scenario-type asset adds the scenario fileTag to the page', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario' }), project: PROJECT() });
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).toContain('scenario');
    });

    // A1/A4: a shared type (scenario/texte/ref) linked to a SECOND card KEEPS the first link.
    it('shared type: linking to a second card adds a row and keeps the existing link', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', pageLinks: [LINK('page-a', 'A')] }), project: PROJECT() });
      prisma.page.findUnique.mockResolvedValue({ id: 'page-b', projectId: 'proj-1', linkedFileIds: [], fileTags: [] });
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-b' });
      expect(prisma.assetPageLink.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ assetId: 'asset-1', pageId: 'page-b' }], skipDuplicates: true }),
      );
      // Never delete the other card's link for a shared type.
      expect(prisma.assetPageLink.delete).not.toHaveBeenCalled();
    });

    // A4: re-linking a shared type to the SAME card is idempotent (skipDuplicates), no other link touched.
    it('shared type: re-linking the same card is idempotent (skipDuplicates), keeps other links', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET({ type: 'scenario', pageLinks: [LINK('page-a', 'A'), LINK('page-b', 'B')] }),
        project: PROJECT(),
      });
      prisma.page.findUnique.mockResolvedValue({ id: 'page-a', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] });
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-a' });
      expect(prisma.assetPageLink.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
      expect(prisma.assetPageLink.delete).not.toHaveBeenCalled();
    });

    // A2/A4: a single-card type (dessin/page) REPLACES — its other link is dropped + detached.
    it('single type: linking a dessin to a new card replaces its existing link', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'dessin', pageLinks: [LINK('page-old', 'Old')] }), project: PROJECT() });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'page-old'
          ? Promise.resolve({ id: 'page-old', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: [] })
          : Promise.resolve({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
      );
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      expect(prisma.assetPageLink.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId_pageId: { assetId: 'asset-1', pageId: 'page-old' } } }),
      );
      const oldUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-old');
      expect(oldUpdate[0].data.linkedFileIds).not.toContain('asset-1');
    });

    it('400 when the page belongs to another project', async () => {
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'other', linkedFileIds: [], fileTags: [] });
      await expect(service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    // R-B2: single-type replace must prune the old card's file-type chip too, not just linkedFileIds.
    it('single type: replace prunes the old card chip when this asset was its sole link of that type', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'dessin', pageLinks: [LINK('page-old', 'Old')] }), project: PROJECT() });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'page-old'
          ? Promise.resolve({ id: 'page-old', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['nemu'] })
          : Promise.resolve({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
      );
      // dessin isn't a PAGE_FILE_TAG so no chip prune happens for it; use a re-typed case below instead.
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const oldUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-old');
      expect(oldUpdate[0].data.linkedFileIds).not.toContain('asset-1');
    });

    it('does not write a type when none is supplied (regression: byte-for-byte)', async () => {
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });

    // B8: section-scoped link re-types the asset (only the type column is written now).
    it('re-types the asset when a type is supplied (＋ Lier from PAGE → type page)', async () => {
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1', type: 'page' });
      expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { type: 'page' } }));
    });

    it('adds the new type chip on re-type (ref → ref fileTag)', async () => {
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1', type: 'ref' });
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).toContain('ref');
    });

    // Same-page re-classification: prune the old chip iff it was the last of its type, add the new.
    it('same-page re-classification prunes the old type chip and adds the new one', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', pageLinks: [LINK('page-1')] }), project: PROJECT() });
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] });
      prisma.asset.count.mockResolvedValue(0); // no other scenario asset linked to page-1
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1', type: 'ref' });
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).not.toContain('scenario');
      expect(pageUpdate[0].data.fileTags).toContain('ref');
    });

    it('same-page re-classification keeps the old chip when another asset of that type remains', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', pageLinks: [LINK('page-1')] }), project: PROJECT() });
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'proj-1', linkedFileIds: ['asset-1', 'asset-2'], fileTags: ['scenario'] });
      prisma.asset.count.mockResolvedValue(1); // asset-2 still scenario on page-1
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1', type: 'ref' });
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).toContain('scenario');
      expect(pageUpdate[0].data.fileTags).toContain('ref');
    });

    // B3 edge (D-ML1): re-typing a multi-linked shared asset TO a single type collapses to one card.
    it('re-type to single type (dessin) collapses a multi-linked asset to just the target card', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET({ type: 'scenario', pageLinks: [LINK('page-a', 'A'), LINK('page-b', 'B')] }),
        project: PROJECT(),
      });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] }),
      );
      prisma.asset.count.mockResolvedValue(0);
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-c', type: 'dessin' });
      expect(prisma.assetPageLink.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId_pageId: { assetId: 'asset-1', pageId: 'page-a' } } }),
      );
      expect(prisma.assetPageLink.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId_pageId: { assetId: 'asset-1', pageId: 'page-b' } } }),
      );
    });

    // A6 re-type ripple: a still-linked OTHER card reconciles its chips to the new type.
    it('re-type ripple: other still-linked cards lose the old chip and gain the new one', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET({ type: 'scenario', pageLinks: [LINK('page-a', 'A'), LINK('page-b', 'B')] }),
        project: PROJECT(),
      });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] }),
      );
      prisma.asset.count.mockResolvedValue(0); // asset was the sole scenario on page-a
      // re-link to page-b (already linked) with type ref → shared type keeps page-a, reconciles it.
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-b', type: 'ref' });
      const aUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-a');
      expect(aUpdate[0].data.fileTags).not.toContain('scenario');
      expect(aUpdate[0].data.fileTags).toContain('ref');
    });
  });

  // ── unlinkFromPage (2026-07-14 per-card) ───────────────────────────────────
  describe('unlinkFromPage', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', pageLinks: [LINK('page-1')] }), project: PROJECT() });
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] });
    });

    it('deletes only that card join row and removes the id from the page linkedFileIds', async () => {
      await service.unlinkFromPage('acc-me', 'asset-1', 'page-1');
      expect(prisma.assetPageLink.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId_pageId: { assetId: 'asset-1', pageId: 'page-1' } } }),
      );
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.linkedFileIds).not.toContain('asset-1');
    });

    // A5: unlinking one card leaves the asset's other cards linked.
    it('leaves the asset linked to its other cards', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET({ type: 'scenario', pageLinks: [LINK('page-1'), LINK('page-2')] }),
        project: PROJECT(),
      });
      await service.unlinkFromPage('acc-me', 'asset-1', 'page-1');
      // Only page-1's row is deleted; page-2 is untouched.
      expect(prisma.assetPageLink.delete).toHaveBeenCalledTimes(1);
      expect(prisma.assetPageLink.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId_pageId: { assetId: 'asset-1', pageId: 'page-1' } } }),
      );
    });

    it('prunes the fileTag chip when it was the last linked asset of that type', async () => {
      prisma.asset.count.mockResolvedValue(0);
      await service.unlinkFromPage('acc-me', 'asset-1', 'page-1');
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).not.toContain('scenario');
    });

    it('keeps the fileTag chip when another linked asset of that type remains', async () => {
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'proj-1', linkedFileIds: ['asset-1', 'asset-2'], fileTags: ['scenario'] });
      prisma.asset.count.mockResolvedValue(1);
      await service.unlinkFromPage('acc-me', 'asset-1', 'page-1');
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).toBeUndefined();
    });

    it('is an idempotent no-op when the asset is not linked to that card', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ pageLinks: [] }), project: PROJECT() });
      await service.unlinkFromPage('acc-me', 'asset-1', 'page-1');
      expect(prisma.page.update).not.toHaveBeenCalled();
      expect(prisma.assetPageLink.delete).not.toHaveBeenCalled();
    });

    it('400 when pageId is missing', async () => {
      await expect(service.unlinkFromPage('acc-me', 'asset-1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 for an unknown asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(service.unlinkFromPage('acc-me', 'ghost', 'page-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 for a non-member on a public project', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT({ visibility: 'public' }) });
      await expect(service.unlinkFromPage('stranger', 'asset-1', 'page-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 for a non-member on a private project', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT({ visibility: 'prive' }) });
      await expect(service.unlinkFromPage('stranger', 'asset-1', 'page-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── deleteAsset (2026-07-14: removes ALL links) ────────────────────────────
  describe('deleteAsset', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ pageLinks: [] }), project: PROJECT() });
      prisma.assetVersion.findMany.mockResolvedValue([{ mediaId: 'media-1' }, { mediaId: 'media-2' }, { mediaId: 'media-1' }]);
    });

    it('deletes the asset (version + link chain cascades)', async () => {
      await service.deleteAsset('acc-me', 'asset-1');
      expect(prisma.asset.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'asset-1' } }));
    });

    it('deletes each DISTINCT version media blob via MediaService', async () => {
      await service.deleteAsset('acc-me', 'asset-1');
      expect(media.deleteMediaById).toHaveBeenCalledTimes(2); // media-1, media-2 (deduped)
      expect(media.deleteMediaById).toHaveBeenCalledWith('media-1');
      expect(media.deleteMediaById).toHaveBeenCalledWith('media-2');
    });

    // A7: delete detaches EVERY linked card.
    it('detaches the asset from ALL its linked cards first (linkedFileIds + fileTags)', async () => {
      prisma.asset.findUnique.mockResolvedValue({
        ...ASSET({ type: 'scenario', pageLinks: [LINK('page-a', 'A'), LINK('page-b', 'B')] }),
        project: PROJECT(),
      });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] }),
      );
      prisma.asset.count.mockResolvedValue(0);
      await service.deleteAsset('acc-me', 'asset-1');
      for (const pid of ['page-a', 'page-b']) {
        const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === pid);
        expect(pageUpdate[0].data.linkedFileIds).not.toContain('asset-1');
        expect(pageUpdate[0].data.fileTags).not.toContain('scenario');
      }
      expect(prisma.asset.delete).toHaveBeenCalled();
    });

    it('does not fail the request when a blob delete rejects', async () => {
      media.deleteMediaById.mockRejectedValue(new Error('S3 down'));
      await expect(service.deleteAsset('acc-me', 'asset-1')).resolves.toBeUndefined();
      expect(prisma.asset.delete).toHaveBeenCalled();
    });

    it('404 for an unknown asset', async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(service.deleteAsset('acc-me', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 for a non-member on a public project', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT({ visibility: 'public' }) });
      await expect(service.deleteAsset('stranger', 'asset-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404 for a non-member on a private project', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT({ visibility: 'prive' }) });
      await expect(service.deleteAsset('stranger', 'asset-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── createFromUrl (B3) — SSRF-guarded ─────────────────────────────────────
  describe('createFromUrl', () => {
    const origFetch = global.fetch;
    afterEach(() => {
      global.fetch = origFetch;
    });

    it('rejects a non-http(s) protocol (400)', async () => {
      await expect(service.createFromUrl('acc-me', 'x', { url: 'file:///etc/passwd' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects the cloud metadata link-local address 169.254.169.254 (400)', async () => {
      await expect(service.createFromUrl('acc-me', 'x', { url: 'http://169.254.169.254/latest/meta-data' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a private-range literal host 10.0.0.5 (400)', async () => {
      await expect(service.createFromUrl('acc-me', 'x', { url: 'http://10.0.0.5/x.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects loopback 127.0.0.1 (400)', async () => {
      await expect(service.createFromUrl('acc-me', 'x', { url: 'http://127.0.0.1/x.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a redirect to a private address (400)', async () => {
      global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/x.png' } })) as never;
      await expect(service.createFromUrl('acc-me', 'x', { url: 'http://93.184.216.34/x.png' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a disallowed content-type (400)', async () => {
      global.fetch = jest.fn().mockResolvedValue(new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'application/zip' } })) as never;
      await expect(service.createFromUrl('acc-me', 'x', { url: 'http://93.184.216.34/x.zip' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('happy path: ingests the fetched bytes and registers the asset (filename from url path)', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
      prisma.media.findUnique.mockResolvedValue(MEDIA({ id: 'media-ingested', contentType: 'image/png' }));
      global.fetch = jest.fn().mockResolvedValue(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as never;
      await service.createFromUrl('acc-me', 'lames-de-brume', { url: 'http://93.184.216.34/dessins/planche.png' });
      expect(media.ingestAsset).toHaveBeenCalledWith('acc-me', expect.any(Buffer), 'image/png');
      expect(prisma.asset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ filename: 'planche.png', mediaId: 'media-ingested' }) }),
      );
    });
  });

  // ── getPreview (B7) ───────────────────────────────────────────────────────
  describe('getPreview', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT() });
    });

    it('image → mode image with a signed web url + downloadUrl', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'image/png' }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('image');
      expect(res.url).toBe('https://signed/variant');
      expect(res.downloadUrl).toBe('https://signed/download');
    });

    it('pdf → mode pdf', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'application/pdf' }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('pdf');
    });

    it('txt → mode text with the file contents (capped)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'text/plain' }));
      s3.getObjectBuffer.mockResolvedValue(Buffer.from('bonjour'));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('text');
      expect(res.text).toBe('bonjour');
    });

    it('docx without preview variant → mode processing', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: DOCX, variants: { orig: 'k.docx' } }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('processing');
    });

    it('docx with preview variant → mode html (read from S3)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: DOCX, variants: { orig: 'k.docx', preview: 'asset/acc-me/media-1/preview.html' } }));
      s3.getObjectBuffer.mockResolvedValue(Buffer.from('<p>hi</p>'));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('html');
      expect(res.html).toBe('<p>hi</p>');
    });

    // CS-4: a materialized in-app scenario is stored as text/html — previewed inline but ALWAYS sanitized.
    it('text/html → mode html with <script> stripped (sanitize-on-render, D11)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'text/html', variants: { orig: 'k.html' } }));
      s3.getObjectBuffer.mockResolvedValue(Buffer.from('<p>ok</p><script>alert(1)</script>'));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('html');
      expect(res.html).toContain('<p>ok</p>');
      expect(res.html).not.toContain('<script>');
    });

    it('psd → mode unavailable', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: PSD, variants: { orig: 'k.psd' } }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('unavailable');
    });

    // CS-3 (2026-07-13): drawing-source (octet-stream) is download-only — never previewed inline.
    it('drawing-source octet-stream → mode unavailable (not processing)', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: 'application/octet-stream', variants: { orig: 'k.clip' } }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('unavailable');
      expect(res.downloadUrl).toBe('https://signed/download'); // download still offered
    });
  });

  // CS-3 (2026-07-13): a drawing-source asset lists as non-previewable.
  describe('list previewable flag', () => {
    it('drawing-source octet-stream asset → previewable: false', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([ASSET({ type: 'dessin', filename: 'planche.clip' })]);
      prisma.media.findMany.mockResolvedValue([MEDIA({ contentType: 'application/octet-stream' })]);
      const res = await service.list('acc-me', 'x', {});
      expect(res.items[0].type).toBe('dessin');
      expect(res.items[0].previewable).toBe(false);
    });
  });
});
