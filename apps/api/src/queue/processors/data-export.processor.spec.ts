/**
 * DataExportProcessor unit tests (F-14).
 * Asserts that gather assembles all expected files, no passwordHash leaks,
 * archive stored privately, DataExport updated, notification + email sent.
 */

import { DataExportProcessor } from './data-export.processor';
import JSZip from 'jszip';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'acc-1';
const EXPORT_ID = 'exp-1';
const MEDIA_ID = 'media-1';

const MOCK_ACCOUNT = {
  id: ACCOUNT_ID,
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  role: 'utilisateur',
  verified: false,
  profileSlug: 'yuki-moreau',
  createdAt: new Date('2026-01-01'),
  emailVerifiedAt: new Date('2026-01-02'),
  passwordHash: 'should-never-appear-in-export', // must NOT be in account.json
  preferences: { theme: 'system' },
  deletedAt: null,
};

const MOCK_EXPORT = {
  id: EXPORT_ID,
  accountId: ACCOUNT_ID,
  status: 'pending',
  mediaId: null,
  requestedAt: new Date('2026-07-01T10:00:00Z'),
  readyAt: null,
  expiresAt: null,
  account: MOCK_ACCOUNT,
};

function makePrisma() {
  return {
    dataExport: {
      findUnique: jest.fn().mockResolvedValue(MOCK_EXPORT),
      update: jest.fn().mockResolvedValue({}),
    },
    profile: { findUnique: jest.fn().mockResolvedValue({ id: 'prof-1', bio: 'Hello', city: null, specialty: null }) },
    portfolioItem: { findMany: jest.fn().mockResolvedValue([]) },
    consentRecord: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findMany: jest.fn().mockResolvedValue([]) },
    media: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makePrivacyService() {
  return {
    runExport: jest.fn(),
  };
}

function makeDeps() {
  const prisma = makePrisma();
  const media = {
    createPrivateArchive: jest.fn().mockResolvedValue({ mediaId: MEDIA_ID }),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  return { prisma, media, notifications, email };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DataExportProcessor', () => {
  let processor: DataExportProcessor;
  let prisma: ReturnType<typeof makePrisma>;
  let media: { createPrivateArchive: jest.Mock };
  let notifications: { create: jest.Mock };
  let email: { send: jest.Mock };

  beforeEach(() => {
    const deps = makeDeps();
    prisma = deps.prisma;
    media = deps.media;
    notifications = deps.notifications;
    email = deps.email;

    processor = new DataExportProcessor(
      prisma as never,
      media as never,
      notifications as never,
      email as never,
    );
  });

  it('has queue = "data-export"', () => {
    expect(processor.queue).toBe('data-export');
  });

  it('is idempotent: skips if export is already ready', async () => {
    prisma.dataExport.findUnique.mockResolvedValue({ ...MOCK_EXPORT, status: 'ready' });

    await processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never);

    expect(media.createPrivateArchive).not.toHaveBeenCalled();
    expect(prisma.dataExport.update).not.toHaveBeenCalled();
  });

  it('produces a zip containing all expected files (no passwordHash)', async () => {
    await processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never);

    expect(media.createPrivateArchive).toHaveBeenCalledTimes(1);
    const [ownerId, buffer, filename] = media.createPrivateArchive.mock.calls[0] as [string, Buffer, string];
    expect(ownerId).toBe(ACCOUNT_ID);
    expect(filename).toMatch(/\.zip$/);

    // Unzip and assert file presence
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);

    expect(files).toContain('account.json');
    expect(files).toContain('profile.json');
    expect(files).toContain('portfolio.json');
    expect(files).toContain('consents.json');
    expect(files).toContain('notifications.json');
    expect(files).toContain('media-manifest.json');
    expect(files).toContain('README.txt');

    // passwordHash must never appear in account.json
    const accountJson = JSON.parse(await zip.files['account.json']!.async('string')) as Record<string, unknown>;
    expect(accountJson).not.toHaveProperty('passwordHash');
    expect(accountJson['email']).toBe('yuki@test.com');
    expect(accountJson['displayName']).toBe('Yuki Moreau');
  });

  it('sets DataExport status to ready with readyAt and expiresAt (+7d)', async () => {
    const before = Date.now();
    await processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never);
    const after = Date.now();

    const updateCall = prisma.dataExport.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; mediaId: string; readyAt: Date; expiresAt: Date };
    };
    expect(updateCall.where.id).toBe(EXPORT_ID);
    expect(updateCall.data.status).toBe('ready');
    expect(updateCall.data.mediaId).toBe(MEDIA_ID);
    expect(updateCall.data.readyAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(updateCall.data.readyAt.getTime()).toBeLessThanOrEqual(after);

    const expectedTtlMs = 7 * 24 * 60 * 60 * 1000;
    expect(updateCall.data.expiresAt.getTime() - updateCall.data.readyAt.getTime()).toBeCloseTo(
      expectedTtlMs,
      -3, // within 1000ms
    );
  });

  it('sends a system notification to the account', async () => {
    await processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never);

    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: ACCOUNT_ID,
      type: 'system',
    });
  });

  it('sends a data_export_ready email to the account', async () => {
    await processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never);

    expect(email.send).toHaveBeenCalledWith(
      'data_export_ready',
      MOCK_ACCOUNT.email,
      { displayName: MOCK_ACCOUNT.displayName },
    );
  });

  it('sets status to failed when an error is thrown', async () => {
    media.createPrivateArchive.mockRejectedValue(new Error('S3 down'));

    await expect(
      processor.process({ accountId: ACCOUNT_ID, exportId: EXPORT_ID }, {} as never),
    ).rejects.toThrow('S3 down');

    expect(prisma.dataExport.update).toHaveBeenCalledWith({
      where: { id: EXPORT_ID },
      data: { status: 'failed' },
    });
  });
});
