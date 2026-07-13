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
  linkedPageId: null,
  linkedPage: null,
  updatedAt: new Date('2026-07-13T00:00:00Z'),
  ...o,
});

describe('AssetsService', () => {
  let service: AssetsService;
  let prisma: any;
  let media: { signedUrl: jest.Mock; ingestAsset: jest.Mock };
  let s3: { presignGet: jest.Mock; getObjectBuffer: jest.Mock; publicUrl: jest.Mock };

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn().mockResolvedValue(PROJECT()) },
      asset: {
        // where.projectId_filename → the "existing?" lookup (default: none). where.id → getAssetItem / loadMemberAsset.
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          where.projectId_filename ? Promise.resolve(null) : Promise.resolve({ ...ASSET(), linkedPage: null, project: PROJECT() }),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(ASSET({ ...data, id: 'asset-new', updatedAt: new Date() }))),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(ASSET({ ...data }))),
      },
      assetVersion: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
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
  });

  // ── list (B4) ─────────────────────────────────────────────────────────────
  describe('list', () => {
    it('composes AND filters: type + pageId + q (case-insensitive)', async () => {
      await service.list('acc-me', 'x', { type: 'dessin', pageId: 'page-1', q: 'Plan' });
      const where = prisma.asset.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ projectId: 'proj-1', type: 'dessin', linkedPageId: 'page-1' });
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

    it('item carries currentVersion + linkedPage; thumbnailUrl null for documents', async () => {
      prisma.asset.count.mockResolvedValue(1);
      prisma.asset.findMany.mockResolvedValue([ASSET({ mediaId: 'media-doc', currentVersion: 2, linkedPage: { id: 'page-1', title: 'Page 7' } })]);
      prisma.media.findMany.mockResolvedValue([MEDIA({ id: 'media-doc', contentType: DOCX, variants: { orig: 'asset/acc-me/media-doc.docx' } })]);
      const res = await service.list('acc-me', 'x', {});
      expect(res.items[0].currentVersion).toBe(2);
      expect(res.items[0].linkedPage).toEqual({ id: 'page-1', title: 'Page 7' });
      expect(res.items[0].thumbnailUrl).toBeNull();
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
  });

  // ── linkToPage (B9) ───────────────────────────────────────────────────────
  describe('linkToPage', () => {
    beforeEach(() => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET(), project: PROJECT() });
    });

    it('sets linkedPageId and appends assetId to page.linkedFileIds', async () => {
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      expect(prisma.asset.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ linkedPageId: 'page-1' }) }));
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.linkedFileIds).toContain('asset-1');
    });

    it('scenario-type asset adds the scenario fileTag to the page', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario' }), project: PROJECT() });
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const pageUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-1');
      expect(pageUpdate[0].data.fileTags).toContain('scenario');
    });

    it('re-link removes the asset from the previously linked page', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ linkedPageId: 'page-old' }), project: PROJECT() });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'page-old'
          ? Promise.resolve({ id: 'page-old', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: [] })
          : Promise.resolve({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
      );
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const oldUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-old');
      expect(oldUpdate[0].data.linkedFileIds).not.toContain('asset-1');
    });

    it('400 when the page belongs to another project', async () => {
      prisma.page.findUnique.mockResolvedValue({ id: 'page-1', projectId: 'other', linkedFileIds: [], fileTags: [] });
      await expect(service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    // R-B2: re-link must prune the old card's file-type chip too, not just linkedFileIds.
    it('re-link prunes the scenario fileTag from the old page when this asset was its sole scenario link', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', linkedPageId: 'page-old' }), project: PROJECT() });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'page-old'
          ? Promise.resolve({ id: 'page-old', projectId: 'proj-1', linkedFileIds: ['asset-1'], fileTags: ['scenario'] })
          : Promise.resolve({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
      );
      prisma.asset.count.mockResolvedValue(0); // no remaining scenario asset on page-old
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const oldUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-old');
      expect(oldUpdate[0].data.fileTags).not.toContain('scenario');
    });

    it('re-link keeps the scenario fileTag on the old page when another scenario asset remains linked there', async () => {
      prisma.asset.findUnique.mockResolvedValue({ ...ASSET({ type: 'scenario', linkedPageId: 'page-old' }), project: PROJECT() });
      prisma.page.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'page-old'
          ? Promise.resolve({ id: 'page-old', projectId: 'proj-1', linkedFileIds: ['asset-1', 'asset-2'], fileTags: ['scenario'] })
          : Promise.resolve({ id: 'page-1', projectId: 'proj-1', linkedFileIds: [], fileTags: [] }),
      );
      prisma.asset.count.mockResolvedValue(1); // asset-2 is still a scenario link on page-old
      await service.linkToPage('acc-me', 'asset-1', { pageId: 'page-1' });
      const oldUpdate = prisma.page.update.mock.calls.find((c: any) => c[0].where.id === 'page-old');
      // Tag left untouched (not re-written) → the chip stays on the old card.
      expect(oldUpdate[0].data.fileTags).toBeUndefined();
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

    it('psd → mode unavailable', async () => {
      prisma.media.findUnique.mockResolvedValue(MEDIA({ contentType: PSD, variants: { orig: 'k.psd' } }));
      const res = await service.getPreview('acc-me', 'asset-1');
      expect(res.mode).toBe('unavailable');
    });
  });
});
