import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { LEGAL_VERSION_UNKNOWN } from '@encre-et-plume/shared';

// ── fixtures ─────────────────────────────────────────────────────────────────

const DOC_CGU = {
  id: 'doc-cgu-1',
  kind: 'cgu' as const,
  version: '1.0',
  content: '<h1>CGU</h1>',
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const DOC_CGU_V2 = {
  id: 'doc-cgu-2',
  kind: 'cgu' as const,
  version: '2.0',
  content: '<h1>CGU v2</h1>',
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
};

function makePrismaMock() {
  return {
    legalDocument: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    consentRecord: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('LegalService', () => {
  let service: LegalService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new LegalService(prisma as unknown as PrismaService);
  });

  // ── getCurrent ───────────────────────────────────────────────────────────────

  describe('getCurrent()', () => {
    it('returns the latest published doc mapped to LegalDocumentDto', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU);

      const result = await service.getCurrent('cgu');

      expect(prisma.legalDocument.findFirst).toHaveBeenCalledWith({
        where: { kind: 'cgu' },
        orderBy: { publishedAt: 'desc' },
      });
      expect(result).toEqual({
        kind: 'cgu',
        version: '1.0',
        content: '<h1>CGU</h1>',
        publishedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('throws 404 NotFoundException when no document exists for the kind', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(null);

      await expect(service.getCurrent('cgu')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the most-recently-published row (latest publishedAt wins)', async () => {
      // findFirst is called with orderBy publishedAt desc — mock returns the newest
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU_V2);

      const result = await service.getCurrent('cgu');

      expect(result.version).toBe('2.0');
    });
  });

  // ── currentVersion ───────────────────────────────────────────────────────────

  describe('currentVersion()', () => {
    it('returns the version string of the current doc', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU);

      expect(await service.currentVersion('cgu')).toBe('1.0');
    });

    it('returns null when no document exists for the kind', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(null);

      expect(await service.currentVersion('cgu')).toBeNull();
    });
  });

  // ── isPublishedVersion ───────────────────────────────────────────────────────

  describe('isPublishedVersion()', () => {
    it('returns true when the (kind, version) pair exists', async () => {
      prisma.legalDocument.count.mockResolvedValue(1);

      expect(await service.isPublishedVersion('cgu', '1.0')).toBe(true);
      expect(prisma.legalDocument.count).toHaveBeenCalledWith({
        where: { kind: 'cgu', version: '1.0' },
      });
    });

    it('returns false when the (kind, version) pair does not exist', async () => {
      prisma.legalDocument.count.mockResolvedValue(0);

      expect(await service.isPublishedVersion('cgu', '9.9')).toBe(false);
    });
  });

  // ── recordConsent ────────────────────────────────────────────────────────────

  describe('recordConsent()', () => {
    it('creates a ConsentRecord when version is published', async () => {
      prisma.legalDocument.count.mockResolvedValue(1); // isPublishedVersion → true
      prisma.consentRecord.create.mockResolvedValue({});

      await service.recordConsent('acc-1', 'cgu', '1.0', '127.0.0.1');

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: { accountId: 'acc-1', document: 'cgu', version: '1.0', ip: '127.0.0.1' },
      });
    });

    it('creates a ConsentRecord without ip when ip is omitted', async () => {
      prisma.legalDocument.count.mockResolvedValue(1);
      prisma.consentRecord.create.mockResolvedValue({});

      await service.recordConsent('acc-1', 'privacy', '1.0');

      expect(prisma.consentRecord.create).toHaveBeenCalledWith({
        data: { accountId: 'acc-1', document: 'privacy', version: '1.0', ip: undefined },
      });
    });

    it('throws 400 BadRequestException with LEGAL_VERSION_UNKNOWN when version is not published', async () => {
      prisma.legalDocument.count.mockResolvedValue(0); // isPublishedVersion → false

      await expect(service.recordConsent('acc-1', 'cgu', '9.9')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      try {
        await service.recordConsent('acc-1', 'cgu', '9.9');
      } catch (err) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          error: LEGAL_VERSION_UNKNOWN,
          statusCode: 400,
        });
      }

      expect(prisma.consentRecord.create).not.toHaveBeenCalled();
    });
  });

  // ── needsCguReconsent ────────────────────────────────────────────────────────

  describe('needsCguReconsent()', () => {
    it('returns false when no cgu document is published (no prompt if no CGU exists)', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(null); // no current cgu

      expect(await service.needsCguReconsent('acc-1')).toBe(false);
      expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
    });

    it('returns true when account has no ConsentRecord for the current cgu version', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU);
      prisma.consentRecord.findFirst.mockResolvedValue(null); // not accepted

      expect(await service.needsCguReconsent('acc-1')).toBe(true);
      expect(prisma.consentRecord.findFirst).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', document: 'cgu', version: '1.0' },
      });
    });

    it('returns false when account already has a ConsentRecord for the current cgu version', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU);
      prisma.consentRecord.findFirst.mockResolvedValue({ id: 'cr-1', version: '1.0' });

      expect(await service.needsCguReconsent('acc-1')).toBe(false);
    });

    it('returns true after a new cgu version is published and account only has the old record', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU_V2); // current = 2.0
      prisma.consentRecord.findFirst.mockResolvedValue(null); // no record for 2.0

      expect(await service.needsCguReconsent('acc-1')).toBe(true);
    });

    it('returns false after account accepts the new cgu version', async () => {
      prisma.legalDocument.findFirst.mockResolvedValue(DOC_CGU_V2);
      prisma.consentRecord.findFirst.mockResolvedValue({ id: 'cr-2', version: '2.0' });

      expect(await service.needsCguReconsent('acc-1')).toBe(false);
    });
  });
});
