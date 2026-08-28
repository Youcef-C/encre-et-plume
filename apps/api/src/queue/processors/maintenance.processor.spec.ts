/**
 * MaintenanceProcessor unit tests (F-25). Prisma, PrivacyService and MediaService are mocked;
 * the assertions are on the exact `where` filters and cutoffs the sweeps issue.
 */
import type { Job } from 'bullmq';
import { MaintenanceProcessor } from './maintenance.processor';
import { SWEEP_PAGE, SWEEP_RUN_CAP } from '../../maintenance/sweep';
import * as Y from 'yjs';

const DAY = 24 * 60 * 60 * 1000;

function tokenModel() {
  return { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
}

function makePrisma() {
  const prisma: any = {
    emailVerificationToken: tokenModel(),
    passwordResetToken: tokenModel(),
    emailChangeToken: tokenModel(),
    notification: tokenModel(),
    scenarioUpdate: tokenModel(),
    scenarioDocument: { findUnique: jest.fn().mockResolvedValue({ ydocState: null }), update: jest.fn().mockResolvedValue({}) },
    event: tokenModel(), // F-23 B14
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

function rows(n: number, from = 0) {
  return Array.from({ length: n }, (_, i) => ({ id: `id-${from + i}` }));
}

describe('MaintenanceProcessor (F-25)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let privacy: { purgeExpiredExports: jest.Mock };
  let media: { cleanupOrphans: jest.Mock };
  let processor: MaintenanceProcessor;

  beforeEach(() => {
    prisma = makePrisma();
    privacy = { purgeExpiredExports: jest.fn().mockResolvedValue(0) };
    media = { cleanupOrphans: jest.fn().mockResolvedValue(0) };
    processor = new MaintenanceProcessor(prisma as never, privacy as never, media as never);
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'error').mockImplementation(() => undefined);
  });

  it('targets the maintenance queue', () => {
    expect(processor.queue).toBe('maintenance');
  });

  // ── B4 · auth-tokens ────────────────────────────────────────────────────────

  it('B4 · deletes expired rows from the three token models', async () => {
    prisma.passwordResetToken.findMany.mockResolvedValueOnce(rows(2));
    prisma.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 2 });

    await processor.process({}, {} as Job);

    for (const model of [prisma.emailVerificationToken, prisma.passwordResetToken, prisma.emailChangeToken]) {
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ expiresAt: { lt: expect.any(Date) } }),
          take: SWEEP_PAGE,
          orderBy: { id: 'asc' },
        }),
      );
    }
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-0', 'id-1'] } },
    });
  });

  it('B4 · a live token is out of the filter (cutoff is now, not a padded one)', async () => {
    const before = Date.now();
    await processor.process({}, {} as Job);
    const { where } = prisma.emailVerificationToken.findMany.mock.calls[0][0];
    expect(where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.expiresAt.lt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  // ── B5/B8 + B11 · delegation, never a second implementation ─────────────────

  it('B8 · delegates the data-exports sweep to the existing PrivacyService.purgeExpiredExports()', async () => {
    await processor.process({}, {} as Job);
    expect(privacy.purgeExpiredExports).toHaveBeenCalledTimes(1);
  });

  it('B11 · delegates the media-orphans sweep to MediaService.cleanupOrphans()', async () => {
    await processor.process({}, {} as Job);
    expect(media.cleanupOrphans).toHaveBeenCalledTimes(1);
  });

  // ── B6/B9 · notifications ───────────────────────────────────────────────────

  it('B6+B9 · sweeps READ notifications older than 90 days, never unread ones', async () => {
    await processor.process({}, {} as Job);

    const { where } = prisma.notification.findMany.mock.calls[0][0];
    expect(where.readAt).toEqual({ not: null }); // B9 — an unread aged row is not matched
    const cutoff = (where.createdAt.lt as Date).getTime();
    expect(Math.round((Date.now() - cutoff) / DAY)).toBe(90);
  });

  // ── B7 · scenario updates ───────────────────────────────────────────────────

  it('B7 · deletes a 31-day-old update, keeps a 29-day-old one, and reads no document', async () => {
    prisma.scenarioUpdate.findMany.mockResolvedValueOnce([{ id: 'sup-1' }, { id: 'sup-2' }]);
    prisma.scenarioUpdate.deleteMany.mockResolvedValueOnce({ count: 2 });

    await processor.process({}, {} as Job);

    const { where, select } = prisma.scenarioUpdate.findMany.mock.calls[0][0];
    const cutoff = (where.createdAt.lt as Date).getTime();
    expect(cutoff).toBeGreaterThan(Date.now() - 31 * DAY); // a 31-day-old row is past the cutoff → swept
    expect(cutoff).toBeLessThan(Date.now() - 29 * DAY); //    a 29-day-old row is not → survives
    expect(select).toEqual({ id: true }); // no `document` relation: the where is the whole predicate
    // every fetched row is doomed — no post-query filter
    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['sup-1', 'sup-2'] } },
    });
  });

  // ── B10/D-1 · bounded, cursor-paged loops ───────────────────────────────────

  it('B10/D-1 · pages by the last FETCHED id and stops when a page comes back short', async () => {
    prisma.emailVerificationToken.findMany
      .mockResolvedValueOnce(rows(SWEEP_PAGE))
      .mockResolvedValueOnce(rows(3, SWEEP_PAGE));
    prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });

    await processor.process({}, {} as Job);

    expect(prisma.emailVerificationToken.findMany).toHaveBeenCalledTimes(2);
    const second = prisma.emailVerificationToken.findMany.mock.calls[1][0];
    expect(second.where.id).toEqual({ gt: `id-${SWEEP_PAGE - 1}` });
  });

  it('B10/D-1 · a never-ending backlog stops at the run cap, cursor following the last fetched id', async () => {
    prisma.scenarioUpdate.findMany.mockImplementation(({ where }: { where: { id?: { gt: string } } }) => {
      const from = where.id ? Number(where.id.gt.split('-')[1]) + 1 : 0;
      return Promise.resolve(rows(SWEEP_PAGE, from));
    });

    await processor.process({}, {} as Job);

    expect(prisma.scenarioUpdate.findMany).toHaveBeenCalledTimes(SWEEP_RUN_CAP / SWEEP_PAGE);
    const last = prisma.scenarioUpdate.findMany.mock.calls.at(-1)![0];
    expect(last.where.id).toEqual({ gt: `id-${SWEEP_RUN_CAP - SWEEP_PAGE - 1}` });
  });

  // ── B3 · isolation + dead-letter ────────────────────────────────────────────

  it('B3 · one sweep failing still runs the others, then the job fails', async () => {
    privacy.purgeExpiredExports.mockRejectedValue(new Error('S3 down'));

    await expect(processor.process({}, {} as Job)).rejects.toThrow(/data-exports/);

    // the sweeps on both sides of the failing one still ran
    expect(prisma.emailVerificationToken.findMany).toHaveBeenCalled();
    expect(media.cleanupOrphans).toHaveBeenCalled();
    expect(prisma.notification.findMany).toHaveBeenCalled();
    expect(prisma.scenarioUpdate.findMany).toHaveBeenCalled();
  });

  it('B3 · every sweep succeeding resolves', async () => {
    await expect(processor.process({}, {} as Job)).resolves.toBeUndefined();
  });

  // ── F-23 B14 · events (90-day rolling window) ───────────────────────────────

  it('B14 · deletes Event rows past 90 days on the `at` index', async () => {
    prisma.event.findMany.mockResolvedValueOnce(rows(3));
    prisma.event.deleteMany.mockResolvedValueOnce({ count: 3 });

    await processor.process({}, {} as Job);

    const arg = prisma.event.findMany.mock.calls[0][0] as {
      where: { at: { lt: Date } };
      take: number;
      orderBy: { id: string };
    };
    expect(arg.take).toBe(SWEEP_PAGE);
    expect(arg.orderBy).toEqual({ id: 'asc' });
    const cutoff = arg.where.at.lt;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(90 * DAY - 5000);
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(90 * DAY + 5000);
    expect(prisma.event.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-0', 'id-1', 'id-2'] } },
    });
  });

  it('B14 · keeps an 89-day-old row', async () => {
    await processor.process({}, {} as Job);

    const cutoff = (prisma.event.findMany.mock.calls[0][0] as { where: { at: { lt: Date } } }).where.at.lt;
    const eightyNineDaysOld = new Date(Date.now() - 89 * DAY);
    expect(eightyNineDaysOld.getTime()).toBeGreaterThan(cutoff.getTime());
  });

  it('B14 · the events sweep is bounded by SWEEP_RUN_CAP like every other sweep', async () => {
    prisma.event.findMany.mockImplementation(async () => rows(SWEEP_PAGE));
    prisma.event.deleteMany.mockResolvedValue({ count: SWEEP_PAGE });

    await processor.process({}, {} as Job);

    expect(prisma.event.findMany.mock.calls.length).toBe(SWEEP_RUN_CAP / SWEEP_PAGE);
  });
  // ── CS-21 · scenario-compaction (B2/A6) ─────────────────────────────────────

  const compactionJob = { name: 'scenario-compaction' } as Job;

  it('B2 · compacts documents whose oldest pending update is older than 10 minutes', async () => {
    prisma.scenarioUpdate.findMany
      .mockResolvedValueOnce([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]) // the selector
      .mockResolvedValue([{ id: 'u-1', update: Y.encodeStateAsUpdate(new Y.Doc()) }]); // per-document pending

    await processor.process({}, compactionJob);

    const selector = prisma.scenarioUpdate.findMany.mock.calls[0][0] as {
      where: { createdAt: { lt: Date } };
      distinct: string[];
      take: number;
    };
    expect(selector.distinct).toEqual(['documentId']);
    expect(selector.take).toBe(SWEEP_PAGE);
    expect(Date.now() - selector.where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(10 * 60_000 - 5000);
    expect(prisma.scenarioDocument.update).toHaveBeenCalledTimes(2);
    // A4 — scoped delete, never a blanket one.
    expect(prisma.scenarioUpdate.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1'] } } });
    expect(prisma.scenarioUpdate.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ documentId: expect.anything() }) }),
    );
  });

  it('B2 · the compaction job does NOT run the nightly sweeps', async () => {
    prisma.scenarioUpdate.findMany.mockResolvedValue([]);

    await processor.process({}, compactionJob);

    expect(prisma.emailVerificationToken.findMany).not.toHaveBeenCalled();
    expect(privacy.purgeExpiredExports).not.toHaveBeenCalled();
    expect(media.cleanupOrphans).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('B2 · the nightly gc does NOT compact (F-25 sweep and CS-21 compaction are different jobs)', async () => {
    await processor.process({}, { name: 'gc' } as Job);

    expect(prisma.scenarioDocument.update).not.toHaveBeenCalled();
    expect(media.cleanupOrphans).toHaveBeenCalled();
  });

  // CS-21 (round 2, D-7) — the queue-side half of the merge guard: the job has no DTO in front of it,
  // so one corrupt stored row must not take the whole 10-minute pass down with it.
  it('B2 · one document with an unmergeable stored update is logged and the rest still compact', async () => {
    prisma.scenarioUpdate.findMany
      .mockResolvedValueOnce([{ documentId: 'doc-corrupt' }, { documentId: 'doc-ok' }])
      .mockResolvedValueOnce([{ id: 'u-bad', update: new Uint8Array([158, 139, 91, 106, 199, 186]) }])
      .mockResolvedValue([{ id: 'u-9', update: Y.encodeStateAsUpdate(new Y.Doc()) }]);
    prisma.scenarioDocument.findUnique.mockResolvedValue({ ydocState: Y.encodeStateAsUpdate(new Y.Doc()) });

    await expect(processor.process({}, compactionJob)).rejects.toThrow(/doc-corrupt/);

    expect(processor['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Document invalide'));
    expect(prisma.scenarioDocument.update).toHaveBeenCalledTimes(1); // doc-ok still went through
  });

  it('B2 · one document failing to compact still compacts the rest, then the job fails', async () => {
    prisma.scenarioUpdate.findMany
      .mockResolvedValueOnce([{ documentId: 'doc-bad' }, { documentId: 'doc-ok' }])
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue([{ id: 'u-9', update: Y.encodeStateAsUpdate(new Y.Doc()) }]);

    await expect(processor.process({}, compactionJob)).rejects.toThrow(/doc-bad/);
    expect(prisma.scenarioDocument.update).toHaveBeenCalledTimes(1); // doc-ok still went through
  });
});
