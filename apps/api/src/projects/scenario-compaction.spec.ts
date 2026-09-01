/**
 * CS-21 — compactDocument unit tests. Prisma is mocked (structural, one transaction callback),
 * but Yjs is REAL: the merge is the point, so mocking it would prove nothing.
 *
 * The load-bearing assertion is the scoped delete: compaction must delete exactly the rows it
 * merged and nothing else. `deleteMany({ where: { documentId } })` — the pre-CS-21 shape — drops
 * any row that lands between the read and the delete, which on a 5s idle timer is routine.
 */
import * as Y from 'yjs';
import { compactDocument } from './scenario-compaction';

/** A doc holding `text` in the shared XmlFragment-free way: one Y.Text, enough to prove the merge. */
function updateWithText(text: string, base?: Uint8Array): Uint8Array {
  const doc = new Y.Doc();
  if (base) Y.applyUpdate(doc, base);
  doc.getText('t').insert(doc.getText('t').length, text);
  return Y.encodeStateAsUpdate(doc);
}

function textOf(state: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getText('t').toString();
}

const STORED_UPDATED_AT = new Date('2026-08-30T10:00:00.000Z');

function buildPrisma(pending: { id: string; update: Uint8Array }[], ydocState: Uint8Array | null = null) {
  const prisma: any = {
    scenarioDocument: {
      findUnique: jest.fn().mockResolvedValue({ ydocState, updatedAt: STORED_UPDATED_AT }),
      update: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    },
    scenarioUpdate: {
      findMany: jest.fn().mockResolvedValue(pending),
      deleteMany: jest.fn().mockResolvedValue({ count: pending.length }),
    },
    $transaction: jest.fn((fn: any) => fn(prisma)),
  };
  return prisma;
}

describe('compactDocument (CS-21)', () => {
  it('deletes exactly the ids it read — never a blanket deleteMany({ documentId })', async () => {
    const prisma = buildPrisma([
      { id: 'u-1', update: updateWithText('a') },
      { id: 'u-2', update: updateWithText('b') },
    ]);

    const res = await compactDocument(prisma, 'doc-1');

    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1', 'u-2'] } } });
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalledWith({ where: { documentId: 'doc-1' } });
    expect(res.compacted).toBe(2);
  });

  it('leaves an update that arrived after the pending read (the race) untouched', async () => {
    const prisma = buildPrisma([{ id: 'u-1', update: updateWithText('a') }]);
    // The gateway appends u-2 while compaction is mid-flight: it was not read, so it must not be deleted.
    prisma.scenarioUpdate.findMany.mockImplementation(async () => {
      const read = [{ id: 'u-1', update: updateWithText('a') }];
      return read; // u-2 lands right after this returns
    });

    await compactDocument(prisma, 'doc-1');

    const [[args]] = prisma.scenarioUpdate.deleteMany.mock.calls;
    expect(args.where.id.in).toEqual(['u-1']);
    expect(args.where.id.in).not.toContain('u-2');
  });

  it('merges the pending update bytes into the stored state', async () => {
    const stored = updateWithText('Bonjour ');
    const pending = updateWithText('le monde', stored);
    const prisma = buildPrisma([{ id: 'u-1', update: pending }], stored);

    await compactDocument(prisma, 'doc-1');

    const { data } = prisma.scenarioDocument.update.mock.calls[0][0];
    expect(textOf(data.ydocState)).toBe('Bonjour le monde');
  });

  it('merges the pending rows into a client-supplied state and persists contentJson alongside', async () => {
    const clientState = updateWithText('client ');
    const peerUpdate = updateWithText('peer', clientState);
    const prisma = buildPrisma([{ id: 'u-9', update: peerUpdate }], clientState);

    await compactDocument(prisma, 'doc-1', { state: clientState, contentJson: { type: 'doc' }, template: 'manga' });

    const { where, data } = prisma.scenarioDocument.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'doc-1' });
    expect(textOf(data.ydocState)).toBe('client peer');
    expect(data.contentJson).toEqual({ type: 'doc' });
    expect(data.template).toBe('manga');
    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-9'] } } });
  });

  it('is a no-op when nothing is pending and no client state is supplied (queue job on a quiet doc)', async () => {
    const prisma = buildPrisma([], updateWithText('déjà compacté'));

    const res = await compactDocument(prisma, 'doc-1');

    expect(res.compacted).toBe(0);
    expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalled();
  });

  // Feedback 2026-09-01 — a pure fold (the queue job: no client payload) is NOT an edit. Letting
  // Prisma's @updatedAt bump on it made hasUnsavedScenario flag a just-versioned doc as unsaved.
  it('a queue fold (no contentJson) preserves the stored updatedAt', async () => {
    const prisma = buildPrisma([{ id: 'u-1', update: updateWithText('a') }], updateWithText(''));

    await compactDocument(prisma, 'doc-1');

    const { data } = prisma.scenarioDocument.update.mock.calls[0][0];
    expect(data.updatedAt).toEqual(STORED_UPDATED_AT);
  });

  it('an autosave (with contentJson) still lets @updatedAt bump — a real edit IS unsaved', async () => {
    const prisma = buildPrisma([], null);

    await compactDocument(prisma, 'doc-1', { state: updateWithText('x'), contentJson: { type: 'doc' } });

    const { data } = prisma.scenarioDocument.update.mock.calls[0][0];
    expect(data.updatedAt).toBeUndefined();
  });

  it('does not issue a delete when the client state is written with nothing pending', async () => {
    const prisma = buildPrisma([], null);

    await compactDocument(prisma, 'doc-1', { state: updateWithText('x'), contentJson: { type: 'doc' } });

    expect(prisma.scenarioDocument.update).toHaveBeenCalled();
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalled();
  });

  it('runs the whole read-merge-delete inside one transaction', async () => {
    const prisma = buildPrisma([{ id: 'u-1', update: updateWithText('a') }]);

    await compactDocument(prisma, 'doc-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
