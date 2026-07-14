import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ASSET_ALLOWED_CONTENT_TYPES } from '@encre-et-plume/shared';
import { ScenarioDocumentsService } from './scenario-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { AssetsService } from './assets.service';
import { EditorGateway } from './editor.gateway';

const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  title: 'Lames de brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  work: { creators: [{ accountId: 'acc-me' }, { accountId: 'acc-yuki' }] },
  ...o,
});

const PAGE = (o: Record<string, unknown> = {}) => ({
  id: 'page-1',
  projectId: 'proj-1',
  chapterId: 'chap-1',
  title: 'Page 5',
  createdAt: new Date('2026-07-10T00:00:00Z'),
  project: PROJECT(),
  chapter: { id: 'chap-1', title: 'La rencontre' },
  ...o,
});

// A TipTap PlancheDoc projection the client would PATCH.
const CONTENT = {
  type: 'doc',
  content: [
    {
      type: 'caseBlock',
      attrs: { no: 1 },
      content: [
        { type: 'caseDescription', content: [{ type: 'text', text: 'Rue sous la pluie' }] },
        { type: 'caseDialogue', content: [{ type: 'text', text: 'RIN — « Enfin. »' }] },
      ],
    },
    {
      type: 'caseBlock',
      attrs: { no: 2 },
      content: [
        { type: 'caseDescription', content: [{ type: 'text', text: 'Gros plan' }] },
        { type: 'caseDialogue', content: [{ type: 'text', text: 'YUKI — « Attends. »' }] },
      ],
    },
  ],
};

function buildPrisma(over: Record<string, any> = {}) {
  const prisma: any = {
    page: {
      findUnique: jest.fn().mockResolvedValue(PAGE()),
      findMany: jest.fn().mockResolvedValue([
        { id: 'page-0', createdAt: new Date('2026-07-09T00:00:00Z') },
        { id: 'page-1', createdAt: new Date('2026-07-10T00:00:00Z') },
        { id: 'page-2', createdAt: new Date('2026-07-11T00:00:00Z') },
      ]),
    },
    assetPageLink: { findFirst: jest.fn().mockResolvedValue(null) },
    asset: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    scenarioDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'doc-1', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    },
    scenarioUpdate: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    scenarioComment: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'cmt-1', createdAt: new Date('2026-07-14T00:00:00Z'), ...data, author: { displayName: 'Moi' } }),
      ),
    },
    $transaction: jest.fn((fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
    ...over,
  };
  return prisma;
}

function makeService(prisma: any, over: Record<string, any> = {}) {
  const media = over.media ?? { ingestAsset: jest.fn().mockResolvedValue({ id: 'media-html', size: 10, contentType: 'text/html' }) };
  const assets = over.assets ?? {
    createAsset: jest.fn().mockResolvedValue({ id: 'asset-new', filename: 'scenario-page-5.html', currentVersion: 1 }),
    linkToPage: jest.fn().mockResolvedValue({ id: 'asset-new' }),
    addVersion: jest.fn().mockResolvedValue({ id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 2 }),
    getPreview: jest.fn().mockResolvedValue({ mode: 'text', text: 'Ligne un\n\nLigne deux', downloadUrl: 'x', filename: 'f', version: 1 }),
  };
  const gateway = over.gateway ?? { emitMaterialized: jest.fn(), emitComment: jest.fn() };
  const service = new ScenarioDocumentsService(
    prisma as unknown as PrismaService,
    media as unknown as MediaService,
    assets as unknown as AssetsService,
    gateway as unknown as EditorGateway,
  );
  return { service, media, assets, gateway };
}

describe('ScenarioDocumentsService.getDocument', () => {
  it('404s a non-member (no existence leak)', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    await expect(service.getDocument('stranger', 'page-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns a blank payload (asset:null) for a card with no scenario file', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.asset).toBeNull();
    expect(res.contentJson).toBeNull();
    expect(res.ydocState).toBeNull();
    expect(res.initialHtml).toBeNull();
    expect(res.cases).toEqual([]);
  });

  it('derives plancheNo/total from chapter siblings (page-1 is 2/3)', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.plancheNo).toBe(2);
    expect(res.total).toBe(3);
  });

  it('returns saved contentJson + derived cases when a document exists', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValueOnce({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: CONTENT, ydocState: Buffer.from([1, 2, 3, 4]), comments: [] });
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.asset).toEqual({ id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 });
    expect(res.documentId).toBe('doc-1');
    // F-I7 — the persisted Yjs bytes ride the initial load (base64) so the client hydrates before first paint.
    expect(res.ydocState).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
    expect(res.cases).toEqual([
      { no: 1, description: 'Rue sous la pluie', dialogue: 'RIN — « Enfin. »' },
      { no: 2, description: 'Gros plan', dialogue: 'YUKI — « Attends. »' },
    ]);
  });

  it('converts a linked .txt asset (no document yet) to initialHtml paragraphs', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValueOnce({ asset: { id: 'asset-1', filename: 'scenario-ch6.txt', currentVersion: 1 } });
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.contentJson).toBeNull();
    expect(res.initialHtml).toContain('<p>Ligne un</p>');
    expect(res.initialHtml).toContain('<p>Ligne deux</p>');
  });

  // B-I3 (U6): a linked-but-never-opened .docx returns its converted HTML so the pen icon seeds content.
  it('returns a linked .docx assets converted HTML as initialHtml', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValueOnce({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 1 } });
    const assets = {
      getPreview: jest.fn().mockResolvedValue({ mode: 'html', html: '<p>Depuis Word</p>', downloadUrl: 'x', filename: 'f', version: 1 }),
    };
    const { service } = makeService(prisma, { assets });
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.asset).toEqual({ id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 1 });
    expect(res.contentJson).toBeNull();
    expect(res.initialHtml).toBe('<p>Depuis Word</p>');
  });
});

// B-I2 (D9): explicit ?asset=<id> override — opening a CHOSEN scenario/texte asset into the editor.
describe('ScenarioDocumentsService — ?asset override', () => {
  it('GET with a foreign-project assetId → 404 (no leak)', async () => {
    const prisma = buildPrisma(); // asset.findFirst returns null (scoped where excludes it)
    const { service } = makeService(prisma);
    await expect(service.getDocument('acc-me', 'page-1', 'asset-foreign')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET with a wrong-type assetId (illustration) → 404', async () => {
    const prisma = buildPrisma(); // findFirst where type ∈ {scenario,texte} → null for an illustration
    const { service } = makeService(prisma);
    await expect(service.getDocument('acc-me', 'page-1', 'asset-illustration')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET with a valid ?asset returns THAT asset document (scoped to the page project + scenario/texte)', async () => {
    const prisma = buildPrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-chosen', filename: 'scenario-ch6.txt', currentVersion: 2 });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-chosen', contentJson: CONTENT, comments: [] });
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1', 'asset-chosen');
    expect(prisma.asset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'asset-chosen', projectId: 'proj-1', type: { in: ['scenario', 'texte'] } }) }),
    );
    expect(res.asset).toEqual({ id: 'asset-chosen', filename: 'scenario-ch6.txt', currentVersion: 2 });
    expect(res.documentId).toBe('doc-chosen');
  });

  it('PATCH with ?asset persists to THAT asset and does NOT create a page link (browse ≠ bind)', async () => {
    const prisma = buildPrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-chosen', filename: 'scenario-ch6.txt', currentVersion: 2 });
    prisma.scenarioDocument.findUnique.mockResolvedValue(null); // first open of this asset in the editor
    const { service, assets, gateway } = makeService(prisma);
    const res = await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: CONTENT, html: '<p>x</p>' }, 'asset-chosen');
    expect(prisma.scenarioDocument.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assetId: 'asset-chosen' }) }));
    expect(assets.linkToPage).not.toHaveBeenCalled();
    expect(assets.createAsset).not.toHaveBeenCalled();
    expect(gateway.emitMaterialized).not.toHaveBeenCalled();
    expect(res.materialized).toBeNull();
  });

  it('snapshotVersion with ?asset targets the chosen asset', async () => {
    const prisma = buildPrisma();
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-chosen', filename: 'scenario-ch6.txt', currentVersion: 2 });
    const { service, assets } = makeService(prisma);
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>v</p>' }, 'asset-chosen');
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-chosen', { mediaId: 'media-html' });
  });
});

describe('ScenarioDocumentsService.autosave', () => {
  it('updates an existing document in place and clears pending updates (no new AssetVersion)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: {} });
    const { service, assets } = makeService(prisma);
    const res = await service.autosave('acc-me', 'page-1', { ydocState: Buffer.from('yjs').toString('base64'), contentJson: CONTENT, html: '<p>x</p>' });
    expect(prisma.scenarioDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1' }, data: expect.objectContaining({ contentJson: CONTENT }) }),
    );
    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
    expect(assets.addVersion).not.toHaveBeenCalled(); // never bumps the version
    expect(res.materialized).toBeNull();
  });

  // B-I3 (U6): editing an already-linked scenario — the first save binds the doc to the SAME asset,
  // spawning NO duplicate asset and NEVER bumping the version.
  it('first save on a linked-but-unopened asset creates the doc bound to that SAME asset (no duplicate, no version bump)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-linked', filename: 'scenario-ch6.txt', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue(null); // never opened → no doc yet
    const { service, media, assets, gateway } = makeService(prisma);
    const res = await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: CONTENT, html: '<p>x</p>' });
    expect(prisma.scenarioDocument.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assetId: 'asset-linked' }) }));
    expect(media.ingestAsset).not.toHaveBeenCalled(); // no re-materialization
    expect(assets.createAsset).not.toHaveBeenCalled(); // no duplicate asset
    expect(assets.addVersion).not.toHaveBeenCalled(); // version unchanged
    expect(gateway.emitMaterialized).not.toHaveBeenCalled();
    expect(res.materialized).toBeNull();
  });

  it('materializes a scenario asset + link + document on the first save of a blank card', async () => {
    const prisma = buildPrisma(); // no linked asset, no existing filename
    const { service, media, assets, gateway } = makeService(prisma);
    const res = await service.autosave('acc-me', 'page-1', { ydocState: Buffer.from('y').toString('base64'), contentJson: CONTENT, html: '<p>x</p>' });
    expect(media.ingestAsset).toHaveBeenCalledWith('acc-me', expect.any(Buffer), 'text/html');
    expect(assets.createAsset).toHaveBeenCalledWith(
      'acc-me',
      'lames-de-brume',
      expect.objectContaining({ mediaId: 'media-html', filename: 'scenario-page-5.html', type: 'scenario' }),
    );
    expect(assets.linkToPage).toHaveBeenCalledWith('acc-me', 'asset-new', expect.objectContaining({ pageId: 'page-1', type: 'scenario' }));
    expect(prisma.scenarioDocument.create).toHaveBeenCalled();
    expect(res.materialized).toEqual({ assetId: 'asset-new', filename: 'scenario-page-5.html', documentId: 'doc-1' });
    expect(gateway.emitMaterialized).toHaveBeenCalledWith('page-1', 'asset-new');
  });

  it('dedupes the materialized filename against an existing scenario-<slug>.html', async () => {
    const prisma = buildPrisma();
    prisma.asset.findUnique
      .mockResolvedValueOnce({ id: 'x' }) // scenario-page-5.html taken
      .mockResolvedValueOnce(null); // scenario-page-5-2.html free
    const { service, assets } = makeService(prisma);
    await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: CONTENT, html: '<p>x</p>' });
    expect(assets.createAsset).toHaveBeenCalledWith('acc-me', 'lames-de-brume', expect.objectContaining({ filename: 'scenario-page-5-2.html' }));
  });
});

describe('ScenarioDocumentsService.snapshotVersion', () => {
  it('appends a new HTML AssetVersion via the CS-3 chain', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    const { service, media, assets } = makeService(prisma);
    const res = await service.snapshotVersion('acc-me', 'page-1', { html: '<p>final</p>' });
    expect(media.ingestAsset).toHaveBeenCalledWith('acc-me', expect.any(Buffer), 'text/html');
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-1', { mediaId: 'media-html' });
    expect(res.currentVersion).toBe(2);
  });

  it('400s when the card has no scenario to version', async () => {
    const prisma = buildPrisma(); // no link
    const { service } = makeService(prisma);
    await expect(service.snapshotVersion('acc-me', 'page-1', { html: '<p>x</p>' })).rejects.toBeInstanceOf(BadRequestException);
  });

  // Item 22 — a version note rides through to the CS-3 AssetVersion.
  it('forwards a version note to addVersion', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    const { service, assets } = makeService(prisma);
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>final</p>', note: 'Relecture chapitre 2' });
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-1', {
      mediaId: 'media-html',
      note: 'Relecture chapitre 2',
    });
  });

  it('omits the note key when none is given (no empty note)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    const { service, assets } = makeService(prisma);
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>final</p>' });
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-1', { mediaId: 'media-html' });
  });
});

describe('ScenarioDocumentsService.addComment', () => {
  it('creates a per-case comment and broadcasts it', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    const { service, gateway } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 2, { text: '  Revoir ce dialogue  ' });
    expect(prisma.scenarioComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ documentId: 'doc-1', caseNo: 2, authorId: 'acc-me', text: 'Revoir ce dialogue' }) }),
    );
    expect(res.caseNo).toBe(2);
    expect(res.authorName).toBe('Moi');
    expect(gateway.emitComment).toHaveBeenCalledWith('asset-1', expect.objectContaining({ text: 'Revoir ce dialogue' }));
  });

  // Item 5 — a range-anchored comment persists anchorFrom/anchorTo/quote and returns them.
  it('stores a highlighted-text anchor (from/to/quote) and returns it', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    const { service } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 2, { text: 'À revoir', anchorFrom: 12, anchorTo: 20, quote: 'sous la pluie' });
    expect(prisma.scenarioComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ anchorFrom: 12, anchorTo: 20, quote: 'sous la pluie' }),
      }),
    );
    expect(res.anchorFrom).toBe(12);
    expect(res.anchorTo).toBe(20);
    expect(res.quote).toBe('sous la pluie');
  });

  it('a case-level comment (no anchor) returns null anchor fields', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    const { service } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 1, { text: 'ok' });
    expect(res.anchorFrom).toBeNull();
    expect(res.anchorTo).toBeNull();
    expect(res.quote).toBeNull();
  });

  it('400s on empty/whitespace text', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    const { service } = makeService(prisma);
    await expect(service.addComment('acc-me', 'page-1', 1, { text: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400s when no document exists yet (comment before first save)', async () => {
    const prisma = buildPrisma(); // no link → no document
    const { service } = makeService(prisma);
    await expect(service.addComment('acc-me', 'page-1', 1, { text: 'hi' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

// B-I1: the round-1 spec mocked MediaService entirely, so the `text/html` allowlist gap that 400'd
// materialization + version snapshot in the live stack never showed up. These exercise the REAL
// MediaService seam so a future allowlist edit fails a CS-4 test, not just e2e.
describe('ScenarioDocumentsService — text/html allowlist (un-mocked MediaService)', () => {
  it('tripwire: text/html is on the asset allowlist', () => {
    expect(ASSET_ALLOWED_CONTENT_TYPES as readonly string[]).toContain('text/html');
  });

  function realMedia() {
    const s3 = { putObject: jest.fn().mockResolvedValue(undefined) };
    const mediaPrisma = { media: { create: jest.fn().mockResolvedValue({ id: 'media-html' }) } };
    const redis = { incr: jest.fn(), expire: jest.fn() };
    const queue = { enqueue: jest.fn(), schedule: jest.fn() };
    return new MediaService(
      mediaPrisma as unknown as PrismaService,
      s3 as unknown as S3StorageService,
      redis as unknown as RedisService,
      queue as unknown as QueueService,
    );
  }

  it('materialization runs a real text/html ingest without "Format non pris en charge"', async () => {
    const prisma = buildPrisma(); // blank card → create-when-none branch
    const media = realMedia();
    const assets = {
      createAsset: jest.fn().mockResolvedValue({ id: 'asset-new', filename: 'scenario-page-5.html', currentVersion: 1 }),
      linkToPage: jest.fn().mockResolvedValue({ id: 'asset-new' }),
    };
    const service = new ScenarioDocumentsService(
      prisma as unknown as PrismaService,
      media,
      assets as unknown as AssetsService,
      { emitMaterialized: jest.fn(), emitComment: jest.fn() } as unknown as EditorGateway,
    );
    const res = await service.autosave('acc-me', 'page-1', {
      ydocState: Buffer.from('y').toString('base64'),
      contentJson: CONTENT,
      html: '<p>RIN — « Enfin. »</p>',
    });
    expect(res.materialized).toMatchObject({ assetId: 'asset-new' });
  });

  it('version snapshot runs a real text/html ingest without 400', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    const media = realMedia();
    const assets = { addVersion: jest.fn().mockResolvedValue({ id: 'asset-1', currentVersion: 4 }) };
    const service = new ScenarioDocumentsService(
      prisma as unknown as PrismaService,
      media,
      assets as unknown as AssetsService,
      { emitMaterialized: jest.fn(), emitComment: jest.fn() } as unknown as EditorGateway,
    );
    const res = await service.snapshotVersion('acc-me', 'page-1', { html: '<p>final</p>' });
    expect(res.currentVersion).toBe(4);
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-1', { mediaId: expect.any(String) });
  });
});

describe('ScenarioDocumentsService.share', () => {
  it('returns the editor URL for a member', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    const res = await service.share('acc-me', 'page-1');
    expect(res.url).toContain('/projet/lames-de-brume/editeur/page-1');
  });

  it('404s a non-member', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    await expect(service.share('stranger', 'page-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
