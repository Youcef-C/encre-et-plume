/**
 * CS-21 — compaction against a REAL Postgres (A2 says "asserted against the real service, not a mock").
 * A mocked Prisma cannot prove that the update rows dropped to zero, that the merged bytes decode back
 * to the typed text, or that a row inserted mid-compaction survived the delete.
 *
 * Gated like `queue.integration.spec.ts` is on Redis: if the database is unreachable the suite skips
 * rather than failing. Run it with the dev stack up:
 *   docker compose up -d postgres && pnpm --filter @encre-et-plume/api exec prisma migrate deploy
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';
import { COMPACTION_IDLE_MS, compactDocument } from './scenario-compaction';

// Direct connection: the pooled pgbouncer URL is transaction-mode and this suite creates/destroys rows.
process.env['DATABASE_URL'] =
  process.env['DIRECT_DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5433/encre_et_plume?schema=public';

const prisma = new PrismaClient();
let dbAvailable = false;

/** A Yjs update carrying `text` appended to `base`'s state — the same shape the editor gateway logs. */
function yUpdate(text: string, base?: Uint8Array): Uint8Array {
  const doc = new Y.Doc();
  if (base) Y.applyUpdate(doc, base);
  const t = doc.getText('t');
  t.insert(t.length, text);
  return Y.encodeStateAsUpdate(doc);
}

function textOf(state: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getText('t').toString();
}

const created = { accountId: '', workId: '', projectId: '', assetId: '', documentId: '' };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('scenario-compaction.integration: database unreachable — skipping');
    return;
  }

  const tag = randomUUID().slice(0, 8);
  const account = await prisma.account.create({
    data: {
      displayName: `CS-21 ${tag}`,
      email: `cs21-${tag}@example.test`,
      passwordHash: 'x',
      profileSlug: `cs21-${tag}`,
    },
  });
  const work = await prisma.work.create({ data: { slug: `cs21-${tag}`, title: 'CS-21', genre: 'Seinen' } });
  const project = await prisma.project.create({
    data: { ownerId: account.id, title: 'CS-21', slug: `cs21-${tag}`, workId: work.id },
  });
  const asset = await prisma.asset.create({
    data: { projectId: project.id, type: 'scenario', filename: `cs21-${tag}.html`, size: 1, mediaId: randomUUID() },
  });
  Object.assign(created, { accountId: account.id, workId: work.id, projectId: project.id, assetId: asset.id });
});

afterAll(async () => {
  if (dbAvailable && created.projectId) {
    await prisma.project.delete({ where: { id: created.projectId } }).catch(() => undefined);
    await prisma.work.delete({ where: { id: created.workId } }).catch(() => undefined);
    await prisma.account.delete({ where: { id: created.accountId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

/** Fresh document per test (the asset is 1:1 with it, so it is recreated each time). */
async function seedDocument(state: Uint8Array): Promise<string> {
  await prisma.scenarioDocument.deleteMany({ where: { assetId: created.assetId } });
  const doc = await prisma.scenarioDocument.create({
    data: { assetId: created.assetId, ydocState: Buffer.from(state), contentJson: { type: 'doc', content: [] } },
  });
  created.documentId = doc.id;
  return doc.id;
}

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('CS-21 compaction · real Postgres', () => {
  maybe('A2 · folds every pending update into ydocState and drops the rows to zero', async () => {
    const base = yUpdate('Chapitre 1. ');
    const documentId = await seedDocument(base);
    const second = yUpdate('Il pleut sur ', base);
    const third = yUpdate('la ville.', second);
    await prisma.scenarioUpdate.createMany({
      data: [
        { documentId, update: Buffer.from(second) },
        { documentId, update: Buffer.from(third) },
      ],
    });

    const res = await compactDocument(prisma, documentId);

    expect(res.compacted).toBe(2);
    expect(await prisma.scenarioUpdate.count({ where: { documentId } })).toBe(0);
    const doc = await prisma.scenarioDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(textOf(doc.ydocState)).toBe('Chapitre 1. Il pleut sur la ville.');
  });

  maybe('A4 · an update inserted DURING compaction survives and is folded in by the next pass', async () => {
    const base = yUpdate('a');
    const documentId = await seedDocument(base);
    const early = yUpdate('b', base);
    await prisma.scenarioUpdate.create({ data: { documentId, update: Buffer.from(early) } });

    // The gateway appends a peer's update on ANOTHER connection while the compaction transaction is
    // open, right after it read its pending rows. The blanket `deleteMany({ documentId })` this story
    // removed would have deleted that row unmerged: lost text. The scoped delete cannot reach it.
    const racing = yUpdate('c', base);
    const racingPrisma = {
      $transaction: <T,>(fn: (tx: unknown) => Promise<T>) =>
        prisma.$transaction(async (tx) => {
          const shim = {
            scenarioDocument: tx.scenarioDocument,
            scenarioUpdate: {
              deleteMany: tx.scenarioUpdate.deleteMany.bind(tx.scenarioUpdate),
              findMany: async (args: never) => {
                const rows = await tx.scenarioUpdate.findMany(args);
                await prisma.scenarioUpdate.create({ data: { documentId, update: Buffer.from(racing) } });
                return rows;
              },
            },
          };
          return fn(shim);
        }),
    };

    await compactDocument(racingPrisma as never, documentId);

    const survivors = await prisma.scenarioUpdate.findMany({ where: { documentId } });
    expect(survivors).toHaveLength(1); // the racing row, untouched

    // Next pass folds it in: nothing was lost, only deferred.
    await compactDocument(prisma, documentId);
    expect(await prisma.scenarioUpdate.count({ where: { documentId } })).toBe(0);
    const doc = await prisma.scenarioDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(textOf(doc.ydocState)).toContain('a');
    expect(textOf(doc.ydocState)).toContain('b');
    expect(textOf(doc.ydocState)).toContain('c');
  });

  // BF-2 (round 3) — a rejected single-part autosave must leave the stored state loadable. Before the
  // fix the client's bytes went straight to `ydocState` unvalidated whenever nothing was pending, and
  // every collaborator's next `Y.applyUpdate` threw on a document nobody could repair.
  maybe('BF-2 · a rejected single-part autosave never corrupts the stored ydocState', async () => {
    const base = yUpdate('Texte réel. ');
    const documentId = await seedDocument(base);
    const notYjs = Buffer.from('notbase6', 'base64'); // valid base64, 6 bytes, not a Yjs update

    await expect(
      compactDocument(prisma, documentId, { state: notYjs, contentJson: { type: 'doc', content: [] } }),
    ).rejects.toMatchObject({ status: 400, message: 'Document invalide' });

    const doc = await prisma.scenarioDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(() => Y.applyUpdate(new Y.Doc(), doc.ydocState as Uint8Array)).not.toThrow();
    expect(textOf(doc.ydocState)).toBe('Texte réel. ');
  });

  maybe('A6 · the job selector picks up a document abandoned with updates older than 10 minutes', async () => {
    const base = yUpdate('abandonné ');
    const documentId = await seedDocument(base);
    const row = await prisma.scenarioUpdate.create({
      data: { documentId, update: Buffer.from(yUpdate('sans client', base)) },
    });
    await prisma.scenarioUpdate.update({
      where: { id: row.id },
      data: { createdAt: new Date(Date.now() - COMPACTION_IDLE_MS - 60_000) },
    });

    const stale = await prisma.scenarioUpdate.findMany({
      where: { createdAt: { lt: new Date(Date.now() - COMPACTION_IDLE_MS) } },
      distinct: ['documentId'],
      select: { documentId: true },
      take: 500,
      orderBy: { id: 'asc' },
    });
    expect(stale.map((s) => s.documentId)).toContain(documentId);

    await compactDocument(prisma, documentId);

    expect(await prisma.scenarioUpdate.count({ where: { documentId } })).toBe(0);
    const doc = await prisma.scenarioDocument.findUniqueOrThrow({ where: { id: documentId } });
    expect(textOf(doc.ydocState)).toBe('abandonné sans client');
  });
});
