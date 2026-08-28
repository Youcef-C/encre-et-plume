import { BadRequestException } from '@nestjs/common';
import * as Y from 'yjs';

/**
 * CS-21 — compaction: fold a document's pending `ScenarioUpdate` rows into `ScenarioDocument.ydocState`
 * and delete the rows that were folded in. Nothing else. It never touches `AssetVersion`.
 *
 * ⚠ NEVER `scenarioUpdate.deleteMany({ where: { documentId } })` here. That blanket delete (the shape
 * this replaced) drops any row the `/editor` gateway appended between the read and the delete. It only
 * ever survived because a human pressed « Enregistrer » in a quiet moment; on a 5s idle timer, and in
 * the queue job, updates arrive mid-compaction routinely. Inside ONE transaction we read the pending
 * rows, merge THOSE bytes, and delete exactly THOSE ids — a row inserted concurrently is either read
 * (merged, then deleted) or not read (survives, and the next pass folds it in). Never lost.
 *
 * The merge is `Y.mergeUpdates` on opaque update blobs: byte-level, no semantic decode. The "API never
 * decodes CRDT payloads" convention (comment anchors, CS-22) is about interpretation and still holds.
 */

/** A document whose oldest pending row is this old has no live client compacting it (the browser tick
 *  fires at ~5s), so the queue safety net takes over. Lives here, next to the merge it triggers. */
export const COMPACTION_IDLE_MS = 10 * 60_000;

type PendingRow = { id: string; update: Uint8Array };

/** The slice of Prisma this needs — structural, so the service passes PrismaService and specs pass a mock. */
export type CompactionTx = {
  scenarioDocument: {
    findUnique(args: { where: { id: string }; select: { ydocState: true } }): Promise<{ ydocState: Uint8Array | null } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
  scenarioUpdate: {
    findMany(args: {
      where: { documentId: string };
      select: { id: true; update: true };
      orderBy: { id: 'asc' };
    }): Promise<PendingRow[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
};

export type CompactionPrisma = {
  $transaction<T>(fn: (tx: CompactionTx) => Promise<T>): Promise<T>;
};

export type CompactOptions = {
  /** The client's own full state (`Y.encodeStateAsUpdate`), when compaction is triggered by an autosave. */
  state?: Uint8Array;
  /** The TipTap projection to refresh alongside. Omitted by the queue job (no server-side materializer). */
  contentJson?: unknown;
  template?: string;
};

const nonEmpty = (u: Uint8Array | null | undefined): u is Uint8Array => !!u && u.length > 0;

/**
 * The merge is the ONE place client-supplied bytes can throw: `@IsBase64()` on the DTO stops the
 * ordinary junk, but well-formed base64 that is not a Yjs update is not expressible as a decorator
 * — and the queue job has no DTO in front of it at all. A malformed document is a client error, not
 * a 500 on the app's highest-frequency write path. Only the merge is guarded: a Prisma failure below
 * must still roll back and propagate as itself, never be relabelled a 400.
 *
 * The invariant is "the bytes we are about to store can be LOADED", not "the parts merged", so the
 * merged result is decoded once into a throwaway doc. `Y.mergeUpdates` does not validate a lone part
 * — measured: `mergeUpdates([junk])` returns bytes happily, while `mergeUpdates([good, junk])` and
 * `applyUpdate(doc, junk)` both throw. Without the decode, a single-part compaction (no pending rows
 * — the normal state under the 5s cadence) stores an unloadable state and bricks the document for
 * every collaborator. Called unconditionally for that reason: never trust part count.
 */
function mergeOrReject(parts: Uint8Array[]): Uint8Array {
  try {
    const merged = Y.mergeUpdates(parts);
    Y.applyUpdate(new Y.Doc(), merged);
    return merged;
  } catch {
    throw new BadRequestException('Document invalide');
  }
}

export async function compactDocument(
  prisma: CompactionPrisma,
  documentId: string,
  opts: CompactOptions = {},
): Promise<{ compacted: number }> {
  // An EMPTY supplied state is malformed, not "no state". `isBase64('')` is true so '' reaches here as
  // zero bytes; it would then be filtered out of `parts` and `Y.mergeUpdates([])` would hand back a
  // VALID 2-byte EMPTY document — the merge guard cannot see that, and the draft would be overwritten
  // with nothing. Rejected before the transaction opens: a caller that has a state must have a real one.
  if (opts.state !== undefined && !nonEmpty(opts.state)) throw new BadRequestException('Document invalide');

  return prisma.$transaction(async (tx) => {
    const pending = await tx.scenarioUpdate.findMany({
      where: { documentId },
      select: { id: true, update: true },
      orderBy: { id: 'asc' },
    });

    // Quiet document, no client payload: nothing to write. The queue job hits this most of the time.
    if (pending.length === 0 && !opts.state && opts.contentJson === undefined && !opts.template) {
      return { compacted: 0 };
    }

    const stored = opts.state ?? (await tx.scenarioDocument.findUnique({ where: { id: documentId }, select: { ydocState: true } }))?.ydocState;
    const parts = [stored, ...pending.map((r) => r.update)].filter(nonEmpty);
    // Nothing to merge (a contentJson/template-only write against a doc with no state and no pending
    // rows): leave `ydocState` alone. `mergeUpdates([])` would return an empty document and wipe it.
    const merged = parts.length > 0 ? mergeOrReject(parts) : null;

    await tx.scenarioDocument.update({
      where: { id: documentId },
      data: {
        ...(merged ? { ydocState: Buffer.from(merged) } : {}),
        ...(opts.contentJson !== undefined ? { contentJson: opts.contentJson } : {}),
        ...(opts.template ? { template: opts.template } : {}),
      },
    });

    // Scoped to the ids read above — see the header comment. Not `{ documentId }`. Ever.
    if (pending.length > 0) {
      await tx.scenarioUpdate.deleteMany({ where: { id: { in: pending.map((r) => r.id) } } });
    }

    return { compacted: pending.length };
  });
}
