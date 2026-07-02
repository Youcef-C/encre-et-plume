import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ConsentDocument, LegalDocumentDto, LegalKind } from '@encre-et-plume/shared';
import { LEGAL_VERSION_UNKNOWN } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the latest published document for the given kind. Throws 404 if none. */
  async getCurrent(kind: LegalKind): Promise<LegalDocumentDto> {
    const doc = await this.prisma.legalDocument.findFirst({
      where: { kind },
      orderBy: { publishedAt: 'desc' },
    });
    if (!doc) throw new NotFoundException();
    return {
      kind: doc.kind as LegalKind,
      version: doc.version,
      content: doc.content,
      publishedAt: doc.publishedAt.toISOString(),
    };
  }

  /** Returns the version string of the current published doc, or null if none. */
  async currentVersion(kind: LegalKind): Promise<string | null> {
    const doc = await this.prisma.legalDocument.findFirst({
      where: { kind },
      orderBy: { publishedAt: 'desc' },
    });
    return doc?.version ?? null;
  }

  /** True when a published document exists for the (kind, version) pair. */
  async isPublishedVersion(kind: ConsentDocument, version: string): Promise<boolean> {
    const n = await this.prisma.legalDocument.count({ where: { kind, version } });
    return n > 0;
  }

  /**
   * Records a consent acceptance. Throws 400 LEGAL_VERSION_UNKNOWN for an unpublished version.
   * ponytail: consent_given ActionLog deferred until AD-10
   */
  async recordConsent(
    accountId: string,
    document: ConsentDocument,
    version: string,
    ip?: string,
  ): Promise<void> {
    const published = await this.isPublishedVersion(document, version);
    if (!published) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Version inconnue ou non publiée.',
        error: LEGAL_VERSION_UNKNOWN,
      });
    }
    await this.prisma.consentRecord.create({
      data: { accountId, document, version, ip },
    });
  }

  /**
   * Returns true when the account has no ConsentRecord for the current CGU version.
   * ponytail: 2 indexed reads per /me; cache current cgu version in Redis if /me QPS demands it.
   */
  async needsCguReconsent(accountId: string): Promise<boolean> {
    const version = await this.currentVersion('cgu');
    if (!version) return false;
    const record = await this.prisma.consentRecord.findFirst({
      where: { accountId, document: 'cgu', version },
    });
    return record === null;
  }
}
