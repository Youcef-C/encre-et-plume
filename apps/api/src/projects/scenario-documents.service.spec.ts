import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ASSET_ALLOWED_CONTENT_TYPES } from '@encre-et-plume/shared';
import { ScenarioDocumentsService } from './scenario-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3StorageService } from '../media/s3-storage.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { AssetsService } from './assets.service';
import { EditorGateway } from './editor.gateway';
import * as Y from 'yjs';

/** CS-21 — a real Yjs update blob; compaction merges these for real, so fake bytes would not do. */
function yUpdate(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('t').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

const PROJECT = (o: Record<string, unknown> = {}) => ({
  id: 'proj-1',
  slug: 'lames-de-brume',
  title: 'Lames de brume',
  ownerId: 'acc-me',
  visibility: 'prive',
  workId: 'work-1',
  // CS-10 — the group columns ride along on the membership rows so the write paths can gate on
  // « Écriture » (hasGroupPermission). `acc-me` is also the ownerId (owner ⇒ always allowed).
  work: {
    creators: [
      { accountId: 'acc-me', groupRole: 'leader', permissions: [] },
      { accountId: 'acc-yuki', groupRole: 'member', permissions: ['ecriture', 'corrections'] },
    ],
  },
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
    assetPageLink: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
    asset: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null) },
    scenarioDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'doc-1', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scenarioUpdate: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    assetVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    media: { findUnique: jest.fn().mockResolvedValue(null) },
    scenarioComment: {
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'cmt-1', createdAt: new Date('2026-07-14T00:00:00Z'), ...data, author: { displayName: 'Moi' } }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ id: 'cmt-1' }),
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
  const gateway = over.gateway ?? { emitMaterialized: jest.fn(), emitComment: jest.fn(), emitCommentDeleted: jest.fn() };
  const s3 = over.s3 ?? { getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('<p>head</p>')) };
  const service = new ScenarioDocumentsService(
    prisma as unknown as PrismaService,
    media as unknown as MediaService,
    assets as unknown as AssetsService,
    gateway as unknown as EditorGateway,
    s3 as unknown as S3StorageService,
  );
  return { service, media, assets, gateway, s3 };
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

  // Feedback 2026-09-01 — the editor's « Corrections dessin » link renders only when a dessin/page
  // file is linked to the card; the payload carries that fact.
  it('hasDessin is true iff a dessin/page file is linked to the card', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    prisma.assetPageLink.count.mockResolvedValueOnce(1);
    expect((await service.getDocument('acc-me', 'page-1')).hasDessin).toBe(true);
    expect(prisma.assetPageLink.count).toHaveBeenCalledWith({
      where: { pageId: 'page-1', asset: { type: { in: ['dessin', 'page'] } } },
    });
    prisma.assetPageLink.count.mockResolvedValueOnce(0);
    expect((await service.getDocument('acc-me', 'page-1')).hasDessin).toBe(false);
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

  // B8 (Fb-2/Fb-7) — a comment that IS a tagged correction surfaces its version + { id, status } in the DTO.
  it('surfaces a linked correction (id + status) and version on a comment DTO', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValueOnce({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({
      id: 'doc-1',
      contentJson: CONTENT,
      ydocState: null,
      comments: [
        {
          id: 'cmt-1', caseNo: 1, authorId: 'acc-me', text: 'Reformuler', createdAt: new Date('2026-07-14T00:00:00Z'),
          author: { displayName: 'Moi' }, anchorFrom: 3, anchorTo: 10, quote: 'texte', version: 2,
          correction: { id: 'corr-1', status: 'a_corriger', assigneeId: 'acc-yuki' },
        },
      ],
    });
    const { service } = makeService(prisma);
    const res = await service.getDocument('acc-me', 'page-1');
    expect(res.comments[0]).toMatchObject({ version: 2, correction: { id: 'corr-1', status: 'a_corriger', assigneeId: 'acc-yuki' } });
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
    // CS-21 — two updates the /editor gateway appended since the last compaction.
    prisma.scenarioUpdate.findMany.mockResolvedValue([
      { id: 'u-1', update: yUpdate('a') },
      { id: 'u-2', update: yUpdate('b') },
    ]);
    const { service, assets } = makeService(prisma);
    const res = await service.autosave('acc-me', 'page-1', { ydocState: Buffer.from(yUpdate('base')).toString('base64'), contentJson: CONTENT, html: '<p>x</p>' });
    expect(prisma.scenarioDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1' }, data: expect.objectContaining({ contentJson: CONTENT }) }),
    );
    // CS-21 — the delete is scoped to the ids read inside the transaction, NEVER `{ documentId }`:
    // a blanket delete drops updates the gateway appended mid-compaction (routine on the idle timer).
    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1', 'u-2'] } } });
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
    expect(assets.addVersion).not.toHaveBeenCalled(); // never bumps the version
    expect(res.materialized).toBeNull();
  });

  // CS-21 (round 2, BF-1) — a malformed `ydocState` is a client error, not a 500 + Sentry alert on the
  // highest-frequency write path. And it is fail-closed: nothing is consumed, every pending row survives.
  it.each([
    ['non-base64', 'not base64 !!'],
    ['well-formed base64 that is not a Yjs update', 'notbase6'],
  ])('rejects a malformed ydocState (%s) with 400 and leaves the pending updates untouched', async (_label, ydocState) => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: {} });
    prisma.scenarioUpdate.findMany.mockResolvedValue([
      { id: 'u-1', update: yUpdate('a') },
      { id: 'u-2', update: yUpdate('b') },
    ]);
    const { service } = makeService(prisma);

    await expect(
      service.autosave('acc-me', 'page-1', { ydocState, contentJson: CONTENT, html: '<p>x</p>' }),
    ).rejects.toMatchObject({ status: 400, message: 'Document invalide' });

    // Fail-closed: the transaction wrote nothing and the pending rows are still there for the next pass.
    expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalled();
  });

  // CS-21 follow-up — an EMPTY ydocState is the last hole in this boundary: `isBase64('')` is true, so
  // '' passes the DTO; it decodes to zero bytes, gets filtered out of `parts`, and `Y.mergeUpdates([])`
  // returns a VALID 2-byte empty document — so the guard could not catch it and the draft was overwritten
  // with an empty doc. One crafted request from any member holding « Écriture » blanked a shared scenario.
  it('rejects an EMPTY ydocState with 400 and never overwrites the stored draft', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: {} });
    prisma.scenarioUpdate.findMany.mockResolvedValue([]); // nothing pending: `parts` would be empty

    const { service } = makeService(prisma);

    await expect(
      service.autosave('acc-me', 'page-1', { ydocState: '', contentJson: CONTENT, html: '<p>x</p>' }),
    ).rejects.toMatchObject({ status: 400, message: 'Document invalide' });

    expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalled();
  });

  // CS-21 (round 3, BF-2) — the single-part path: with ZERO pending rows (the normal state under the 5s
  // cadence) the merge used to be skipped entirely, so valid-base64-but-not-Yjs bytes were stored and
  // every later client load threw. Validation must not depend on a pending row being there.
  it('rejects a not-Yjs ydocState with 400 even when NOTHING is pending (the single-part path)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: {} });
    prisma.scenarioUpdate.findMany.mockResolvedValue([]); // no pending rows: the client's state is the only part
    const { service } = makeService(prisma);

    await expect(
      service.autosave('acc-me', 'page-1', { ydocState: 'notbase6', contentJson: CONTENT, html: '<p>x</p>' }),
    ).rejects.toMatchObject({ status: 400, message: 'Document invalide' });

    expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
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

  // Bug (v1 empty / v1=v2 shift): a stray on-mount/initial save can fire with empty html BEFORE the
  // Yjs doc is populated. Materializing then would burn v1 on an empty document and shift the real
  // first content into v2. The blank-html save must be a no-op — NO asset, NO version, NO doc.
  it.each([[''], ['   '], ['<p></p>'], ['<p><br></p>'], ['<p>&nbsp;</p>']])(
    'does NOT materialize a v1 for a blank-html save (%p) — no empty v1, no v1=v2 shift',
    async (html) => {
      const prisma = buildPrisma(); // no linked asset → create-when-none branch
      const { service, media, assets, gateway } = makeService(prisma);
      const res = await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: { type: 'doc', content: [] }, html });
      expect(media.ingestAsset).not.toHaveBeenCalled();
      expect(assets.createAsset).not.toHaveBeenCalled();
      expect(assets.linkToPage).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
      expect(gateway.emitMaterialized).not.toHaveBeenCalled();
      expect(res.materialized).toBeNull();
    },
  );

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

  // Follow-up 7 — this branch cuts v1, so the doc is born already versioned: `versionedAt` is set and
  // `updatedAt` pinned to the same instant, otherwise the fresh draft reads as unsaved from birth.
  it('stamps versionedAt on the document it materializes (v1 is cut here)', async () => {
    const prisma = buildPrisma();
    const { service } = makeService(prisma);
    await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: CONTENT, html: '<p>x</p>' });
    const { data } = prisma.scenarioDocument.create.mock.calls[0][0];
    expect(data.versionedAt).toBeInstanceOf(Date);
    expect(data.updatedAt.getTime()).toBe(data.versionedAt.getTime());
  });

  it('leaves versionedAt unset when the doc binds to an already-versioned asset (no version cut)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-linked', filename: 'scenario-ch6.txt', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);
    await service.autosave('acc-me', 'page-1', { ydocState: 'AA==', contentJson: CONTENT, html: '<p>x</p>' });
    expect(prisma.scenarioDocument.create.mock.calls[0][0].data.versionedAt).toBeUndefined();
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

  // B11 (Fb-6) — dedupe guard: an identical-to-head snapshot creates NO version (autosave already
  // advanced the head; a re-click without edits must be a no-op).
  function withHtmlHead(prisma: any, headHtml: string) {
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.html', currentVersion: 3 } });
    prisma.assetVersion.findUnique.mockResolvedValue({ mediaId: 'media-head' });
    prisma.media.findUnique.mockResolvedValue({ bucketKey: 'k-head', contentType: 'text/html' });
    return { getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from(headHtml, 'utf8')) };
  }

  it('creates NO new version when the snapshot html is identical to the head version', async () => {
    const prisma = buildPrisma();
    const s3 = withHtmlHead(prisma, '<p>same</p>');
    const assets = { getAssetItem: jest.fn().mockResolvedValue({ id: 'asset-1', currentVersion: 3 }), addVersion: jest.fn() };
    const { service } = makeService(prisma, { s3, assets });
    const res = await service.snapshotVersion('acc-me', 'page-1', { html: '<p>same</p>' });
    expect(assets.addVersion).not.toHaveBeenCalled();
    expect(assets.getAssetItem).toHaveBeenCalledWith('asset-1');
    expect(res.currentVersion).toBe(3); // unchanged head
  });

  it('creates a new version when the snapshot html differs from the head version', async () => {
    const prisma = buildPrisma();
    const s3 = withHtmlHead(prisma, '<p>old</p>');
    const { service, assets } = makeService(prisma, { s3 });
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>NEW content</p>' });
    expect(assets.addVersion).toHaveBeenCalledWith('acc-me', 'lames-de-brume', 'asset-1', { mediaId: 'media-html' });
  });

  it('skips the dedupe guard when the head version media is not text/html (imported .docx head)', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    prisma.assetVersion.findUnique.mockResolvedValue({ mediaId: 'media-head' });
    prisma.media.findUnique.mockResolvedValue({ bucketKey: 'k-head', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const s3 = { getObjectBuffer: jest.fn() };
    const { service, assets } = makeService(prisma, { s3 });
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>anything</p>' });
    expect(s3.getObjectBuffer).not.toHaveBeenCalled(); // binary head → any editor snapshot is new
    expect(assets.addVersion).toHaveBeenCalled();
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

  // Follow-up 7 — the version write stamps `ScenarioDocument.versionedAt`, so `scenarioUnsaved`
  // compares the draft against a real column instead of the old 5s grace window. `updatedAt` is
  // pinned to the SAME instant (the draft now matches the version) — Prisma's auto-@updatedAt would
  // land a hair later and make a freshly-versioned doc look unsaved.
  it('stamps versionedAt on the scenario document when a version is cut', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.docx', currentVersion: 3 } });
    const { service } = makeService(prisma);
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>final</p>' });
    expect(prisma.scenarioDocument.updateMany).toHaveBeenCalledWith({
      where: { assetId: 'asset-1' },
      data: { versionedAt: expect.any(Date), updatedAt: expect.any(Date) },
    });
    const { data } = prisma.scenarioDocument.updateMany.mock.calls[0][0];
    expect(data.updatedAt.getTime()).toBe(data.versionedAt.getTime());
  });

  it('does not stamp versionedAt when the dedupe guard cut no version', async () => {
    const prisma = buildPrisma();
    const s3 = withHtmlHead(prisma, '<p>same</p>');
    const assets = { getAssetItem: jest.fn().mockResolvedValue({ id: 'asset-1', currentVersion: 3 }), addVersion: jest.fn() };
    const { service } = makeService(prisma, { s3, assets });
    await service.snapshotVersion('acc-me', 'page-1', { html: '<p>same</p>' });
    expect(prisma.scenarioDocument.updateMany).not.toHaveBeenCalled();
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

  // B8 (Fb-7) — the created comment is stamped with the asset's current head version and the DTO surfaces it.
  it('stamps the comment version = asset head and returns it in the DTO', async () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 4 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    const { service } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 1, { text: 'À revoir' });
    expect(prisma.scenarioComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 4 }) }),
    );
    expect(res.version).toBe(4);
    expect(res.correction).toBeNull();
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

// CS-15 — author-only delete of a scenario comment.
describe('ScenarioDocumentsService.deleteComment', () => {
  function withDoc(over: Record<string, any> = {}) {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    Object.assign(prisma.scenarioComment, over);
    return prisma;
  }

  it('lets the author delete their own comment, returns { id }, and broadcasts the deletion', async () => {
    const prisma = withDoc({ findFirst: jest.fn().mockResolvedValue({ id: 'cmt-1', authorId: 'acc-me' }) });
    const { service, gateway } = makeService(prisma);
    const res = await service.deleteComment('acc-me', 'page-1', 'cmt-1');
    expect(prisma.scenarioComment.delete).toHaveBeenCalledWith({ where: { id: 'cmt-1' } });
    expect(res).toEqual({ id: 'cmt-1' });
    expect(gateway.emitCommentDeleted).toHaveBeenCalledWith('asset-1', 'cmt-1');
  });

  it('403s a non-author on an existing comment (no delete, no broadcast)', async () => {
    const prisma = withDoc({ findFirst: jest.fn().mockResolvedValue({ id: 'cmt-1', authorId: 'acc-yuki' }) });
    const { service, gateway } = makeService(prisma);
    await expect(service.deleteComment('acc-me', 'page-1', 'cmt-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.scenarioComment.delete).not.toHaveBeenCalled();
    expect(gateway.emitCommentDeleted).not.toHaveBeenCalled();
  });

  it('404s an unknown / already-deleted commentId', async () => {
    const prisma = withDoc({ findFirst: jest.fn().mockResolvedValue(null) });
    const { service } = makeService(prisma);
    await expect(service.deleteComment('acc-me', 'page-1', 'cmt-gone')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes the lookup to the page document (a comment on another document → 404)', async () => {
    const prisma = withDoc({ findFirst: jest.fn().mockResolvedValue(null) });
    const { service } = makeService(prisma);
    await expect(service.deleteComment('acc-me', 'page-1', 'cmt-other')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scenarioComment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'cmt-other', documentId: 'doc-1' }) }),
    );
  });

  it('404s when the page has no document yet (comment before first save)', async () => {
    const prisma = buildPrisma(); // no link → no document
    const { service } = makeService(prisma);
    await expect(service.deleteComment('acc-me', 'page-1', 'cmt-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a non-member (no existence leak) before touching the comment', async () => {
    const prisma = withDoc();
    const { service } = makeService(prisma);
    await expect(service.deleteComment('stranger', 'page-1', 'cmt-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.scenarioComment.delete).not.toHaveBeenCalled();
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
      { getObjectBuffer: jest.fn() } as unknown as S3StorageService,
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
      { getObjectBuffer: jest.fn() } as unknown as S3StorageService,
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

// ── CS-10 round 3 (B11-R3 / T-API-9) — the « Écriture » gate on the REST write path ──────────────
// The permission used to be enforced ONLY on the WS relay (editor.gateway), so a member with the
// toggle OFF could still `PATCH /pages/:id/document` and `POST /pages/:id/document/versions`
// directly (reproduced live: 200 + 201, materializing the asset and cutting v2). These rows are the
// DIRECT-API matrix — a UI/banner assertion is exactly what let the bypass survive two QA rounds.
describe('ScenarioDocumentsService — « Écriture » permission on the REST write paths', () => {
  const GROUP_PROJECT = () =>
    PROJECT({
      work: {
        creators: [
          { accountId: 'acc-me', groupRole: 'leader', permissions: [] }, // also the owner
          { accountId: 'acc-leader', groupRole: 'leader', permissions: [] }, // non-owner leader
          { accountId: 'acc-coleader', groupRole: 'coleader', permissions: [] },
          { accountId: 'acc-writer', groupRole: 'member', permissions: ['ecriture', 'corrections'] },
          { accountId: 'acc-reader', groupRole: 'member', permissions: ['corrections'] }, // Écriture OFF
        ],
      },
    });

  const DENIED = "Vous n'avez pas la permission « Écriture » sur ce projet.";

  /** A page whose project carries the full group matrix, with a linked asset + an existing doc so
   *  both write paths reach their real work when the gate lets them through. */
  function buildGroupPrisma() {
    const prisma = buildPrisma();
    prisma.page.findUnique.mockResolvedValue(PAGE({ project: GROUP_PROJECT() }));
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'scenario-ch5.html', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1', contentJson: {}, ydocState: null, comments: [] });
    return prisma;
  }

  const autosave = (service: ScenarioDocumentsService, accountId: string) =>
    // A REAL Yjs update: this row reaches compaction, which since round 3 rejects a state it cannot
    // load. `'AA=='` was a placeholder byte that no client ever sends (it decodes to a truncated update).
    service.autosave(accountId, 'page-1', {
      ydocState: Buffer.from(yUpdate('écriture')).toString('base64'),
      contentJson: CONTENT,
      html: '<p>x</p>',
    });
  const snapshot = (service: ScenarioDocumentsService, accountId: string) =>
    service.snapshotVersion(accountId, 'page-1', { html: '<p>final</p>' });

  describe.each([
    ['owner', 'acc-me'],
    ['non-owner leader', 'acc-leader'],
    ['co-leader', 'acc-coleader'],
    ['member with « Écriture »', 'acc-writer'],
  ])('%s writes', (_label, accountId) => {
    it('autosaves', async () => {
      const prisma = buildGroupPrisma();
      const { service } = makeService(prisma);
      await expect(autosave(service, accountId)).resolves.toMatchObject({ materialized: null });
      expect(prisma.scenarioDocument.update).toHaveBeenCalled();
    });

    it('snapshots a version', async () => {
      const prisma = buildGroupPrisma();
      const { service, assets } = makeService(prisma);
      await expect(snapshot(service, accountId)).resolves.toMatchObject({ currentVersion: 2 });
      expect(assets.addVersion).toHaveBeenCalled();
    });
  });

  describe('a member with « Écriture » toggled OFF', () => {
    it('is refused on autosave (403) and nothing is written', async () => {
      const prisma = buildGroupPrisma();
      const { service, media, assets } = makeService(prisma);
      await expect(autosave(service, 'acc-reader')).rejects.toMatchObject({ status: 403, message: DENIED });
      expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
      expect(prisma.scenarioDocument.create).not.toHaveBeenCalled();
      expect(media.ingestAsset).not.toHaveBeenCalled();
      expect(assets.createAsset).not.toHaveBeenCalled(); // never materializes the project's asset
    });

    it('is refused on snapshotVersion (403) and no version is cut', async () => {
      const prisma = buildGroupPrisma();
      const { service, assets } = makeService(prisma);
      await expect(snapshot(service, 'acc-reader')).rejects.toMatchObject({ status: 403, message: DENIED });
      expect(assets.addVersion).not.toHaveBeenCalled();
    });

    it('is also refused on a BLANK card (the create-when-none materialize path)', async () => {
      const prisma = buildGroupPrisma();
      prisma.assetPageLink.findFirst.mockResolvedValue(null); // no asset yet
      const { service, assets } = makeService(prisma);
      await expect(autosave(service, 'acc-reader')).rejects.toBeInstanceOf(ForbiddenException);
      expect(assets.createAsset).not.toHaveBeenCalled();
    });

    // Reads are member-gated only — the toggle governs writing, not seeing.
    it('can still READ the document', async () => {
      const prisma = buildGroupPrisma();
      const { service } = makeService(prisma);
      await expect(service.getDocument('acc-reader', 'page-1')).resolves.toMatchObject({ pageId: 'page-1' });
    });

    // Recorded decision (plan §3-B11-R3 item 4): comments are a SEPARATE affordance, not « Écriture »
    // (CS-15 owns author-only delete). They stay member-gated.
    it('can still comment (comments are not « Écriture »)', async () => {
      const prisma = buildGroupPrisma();
      const { service } = makeService(prisma);
      await expect(service.addComment('acc-reader', 'page-1', 1, { text: 'Une note' })).resolves.toMatchObject({ text: 'Une note' });
    });
  });

  it('a non-member still 404s on both write paths (no existence leak, unchanged)', async () => {
    const prisma = buildGroupPrisma();
    const { service } = makeService(prisma);
    await expect(autosave(service, 'stranger')).rejects.toBeInstanceOf(NotFoundException);
    await expect(snapshot(service, 'stranger')).rejects.toBeInstanceOf(NotFoundException);
  });

  // The gate must read the SAME columns the shared seam needs — if the select stays membership-only,
  // `hasGroupPermission` can never see a permission and the gate is decorative.
  it('loads groupRole + permissions with the page (feeds the shared hasGroupPermission seam)', async () => {
    const prisma = buildGroupPrisma();
    const { service } = makeService(prisma);
    await autosave(service, 'acc-me');
    const select = prisma.page.findUnique.mock.calls[0][0].select.project.select.work.select.creators.select;
    expect(select).toMatchObject({ accountId: true, groupRole: true, permissions: true });
  });
});

// ── CS-22 — durable relative anchors persisted alongside the absolute pair ────────────────────────
describe('ScenarioDocumentsService.addComment — CS-22 relative anchors', () => {
  const withDoc = () => {
    const prisma = buildPrisma();
    prisma.assetPageLink.findFirst.mockResolvedValue({ asset: { id: 'asset-1', filename: 'x', currentVersion: 1 } });
    prisma.scenarioDocument.findUnique.mockResolvedValue({ id: 'doc-1' });
    return prisma;
  };
  const REL_FROM = Buffer.from([1, 2, 3, 4]).toString('base64');
  const REL_TO = Buffer.from([5, 6, 7, 8]).toString('base64');

  it('persists both encoded positions as bytes and returns them base64 (REST + WS)', async () => {
    const prisma = withDoc();
    const { service, gateway } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 2, {
      text: 'À revoir', anchorFrom: 12, anchorTo: 20, quote: 'sous la pluie', anchorRelFrom: REL_FROM, anchorRelTo: REL_TO,
    });
    const data = prisma.scenarioComment.create.mock.calls[0][0].data;
    expect(data.anchorRelFrom).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(data.anchorRelFrom).toString('base64')).toBe(REL_FROM);
    expect(Buffer.from(data.anchorRelTo).toString('base64')).toBe(REL_TO);
    expect(res.anchorRelFrom).toBe(REL_FROM);
    expect(res.anchorRelTo).toBe(REL_TO);
    expect(gateway.emitComment).toHaveBeenCalledWith('asset-1', expect.objectContaining({ anchorRelFrom: REL_FROM, anchorRelTo: REL_TO }));
  });

  it('a comment without relative anchors stores + returns nulls (pre-CS-22 fallback path)', async () => {
    const prisma = withDoc();
    const { service } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 1, { text: 'ok', anchorFrom: 3, anchorTo: 9, quote: 'x' });
    const data = prisma.scenarioComment.create.mock.calls[0][0].data;
    expect(data.anchorRelFrom).toBeNull();
    expect(data.anchorRelTo).toBeNull();
    expect(res.anchorRelFrom).toBeNull();
    expect(res.anchorRelTo).toBeNull();
  });

  it('400s an anchor over 512 bytes and writes nothing', async () => {
    const prisma = withDoc();
    const { service } = makeService(prisma);
    await expect(
      service.addComment('acc-me', 'page-1', 1, { text: 'x', anchorFrom: 1, anchorTo: 4, quote: 'q', anchorRelFrom: Buffer.alloc(513).toString('base64') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scenarioComment.create).not.toHaveBeenCalled();
  });

  it('400s a non-base64 anchor payload', async () => {
    const prisma = withDoc();
    const { service } = makeService(prisma);
    await expect(
      service.addComment('acc-me', 'page-1', 1, { text: 'x', anchorFrom: 1, anchorTo: 4, quote: 'q', anchorRelTo: 'pas du base64 !!' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.scenarioComment.create).not.toHaveBeenCalled();
  });

  it('ignores relative anchors on a case-level comment (no absolute range)', async () => {
    const prisma = withDoc();
    const { service } = makeService(prisma);
    const res = await service.addComment('acc-me', 'page-1', 1, { text: 'ok', anchorRelFrom: REL_FROM, anchorRelTo: REL_TO });
    expect(prisma.scenarioComment.create.mock.calls[0][0].data.anchorRelFrom).toBeNull();
    expect(res.anchorRelFrom).toBeNull();
  });
});
