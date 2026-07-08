import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import {
  MEDIA_KINDS,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
  DOCUMENT_MEDIA_KINDS,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_DIMENSION,
} from '@encre-et-plume/shared';
import type {
  MediaKind,
  MediaVisibility,
  MediaResponse,
  RequestUploadResponse,
  SignedUrlResponse,
  RequestUploadRequest,
  MediaVariants,
} from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { S3StorageService } from './s3-storage.service';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';

// ponytail: per-user upload rate-limit key, 30 req/hour is generous for real use.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_S = 3600;

// Visibility defaults: attachment and chapter_page are private by default.
// MC-4X: document kinds stay PUBLIC (detail links are plain CDN URLs).
const PRIVATE_KINDS = new Set<MediaKind>(['attachment', 'chapter_page']);

// MC-4X: kinds that accept ONLY application/pdf and skip the image pipeline.
const DOCUMENT_KINDS = new Set<MediaKind>(DOCUMENT_MEDIA_KINDS as readonly MediaKind[]);

const SIGNED_URL_TTL = () => Number(process.env['MEDIA_SIGNED_URL_TTL'] ?? 300);

// MC-4X §7: content-verify document bytes (the trust boundary — client headers are not trusted).
// PDF: must start with the "%PDF-" magic. Plain text: must NOT be disguised markup (HTML/SVG/XML/JS)
// or a NUL-heavy binary. Returns false to reject. Embedded PDF JS is neutralised at serving time by
// Content-Disposition: attachment, so PDFs only need the magic check here.
const PDF_MAGIC = Buffer.from('%PDF-');
const MARKUP_MARKERS = ['<!doctype', '<html', '<script', '<svg', '<?xml'];

function isVerifiedDocument(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'application/pdf') {
    return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
  }
  // text/plain (and any future text document type): reject disguised markup + binary-posing-as-text.
  const head = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  if (MARKUP_MARKERS.some((m) => head.includes(m))) return false;
  if (buffer.subarray(0, 512).includes(0x00)) return false; // NUL-heavy → not real plain text
  return true;
}

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  };
  return map[ct] ?? 'bin';
}

function toMediaResponse(row: Record<string, unknown>): MediaResponse {
  return {
    id: row['id'] as string,
    kind: row['kind'] as MediaKind,
    status: row['status'] as MediaResponse['status'],
    visibility: row['visibility'] as MediaVisibility,
    width: (row['width'] as number | null) ?? null,
    height: (row['height'] as number | null) ?? null,
    variants: (row['variants'] as MediaVariants | Record<string, never>) ?? {},
    createdAt: (row['createdAt'] as Date).toISOString(),
  };
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3StorageService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
  ) {}

  async requestUpload(accountId: string, dto: RequestUploadRequest): Promise<RequestUploadResponse> {
    // Validate kind
    if (!(MEDIA_KINDS as readonly string[]).includes(dto.kind)) {
      throw new BadRequestException(`kind must be one of: ${MEDIA_KINDS.join(', ')}`);
    }
    // Validate contentType allowlist — kind-aware: document kinds accept ONLY application/pdf;
    // MC-9 message attachments accept BOTH images and documents (PDF/TXT); every other kind keeps the
    // raster allowlist (SVG excluded — XSS risk).
    const allowed = DOCUMENT_KINDS.has(dto.kind as MediaKind)
      ? (DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[])
      : dto.kind === 'attachment'
        ? ([...UPLOAD_ALLOWED_CONTENT_TYPES, ...DOCUMENT_ALLOWED_CONTENT_TYPES] as readonly string[])
        : (UPLOAD_ALLOWED_CONTENT_TYPES as readonly string[]);
    if (!allowed.includes(dto.contentType)) {
      throw new BadRequestException(`contentType not allowed: ${dto.contentType}`);
    }
    // Validate size
    if (dto.size <= 0 || dto.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`size must be between 1 and ${MAX_UPLOAD_BYTES} bytes`);
    }

    // Redis rate-limit: skip when DISABLE_RATE_LIMIT=true (CI / tests).
    // M4: NEVER honor this in production — a stray env var must not disable upload throttling.
    if (!(process.env['DISABLE_RATE_LIMIT'] === 'true' && process.env['NODE_ENV'] !== 'production')) {
      const key = `media:upload:rate:${accountId}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, RATE_LIMIT_WINDOW_S);
      if (count > RATE_LIMIT_MAX) {
        throw new HttpException('Upload rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const ttl = SIGNED_URL_TTL();
    const mediaId = randomUUID().replace(/-/g, '');
    const ext = extFromContentType(dto.contentType);
    const bucketKey = `${dto.kind}/${accountId}/${mediaId}.${ext}`;

    // Determine visibility: caller can override, else default by kind
    const visibility: MediaVisibility = dto.visibility ?? (PRIVATE_KINDS.has(dto.kind as MediaKind) ? 'private' : 'public');

    const media = await this.prisma.media.create({
      data: {
        id: mediaId,
        ownerId: accountId,
        kind: dto.kind as never, // Prisma enum
        bucketKey,
        contentType: dto.contentType,
        size: dto.size,
        status: 'pending',
        visibility: visibility as never,
        variants: {},
      },
    });

    const uploadUrl = await this.s3.presignPut(bucketKey, dto.contentType, dto.size, ttl);

    return {
      mediaId: media['id'] as string,
      uploadUrl,
      bucketKey,
      expiresIn: ttl,
    };
  }

  async finalize(accountId: string, mediaId: string): Promise<MediaResponse> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException();
    if ((media as Record<string, unknown>)['ownerId'] !== accountId) throw new ForbiddenException();
    if ((media as Record<string, unknown>)['status'] !== 'pending') {
      throw new BadRequestException('Media is not in pending status');
    }

    const bucketKey = (media as Record<string, unknown>)['bucketKey'] as string;
    const declaredContentType = (media as Record<string, unknown>)['contentType'] as string;
    const declaredSize = (media as Record<string, unknown>)['size'] as number;

    // Verify object exists and matches declared metadata
    let head: { contentType: string; size: number };
    try {
      head = await this.s3.headObject(bucketKey);
    } catch {
      await this.prisma.media.update({ where: { id: mediaId }, data: { status: 'failed' } });
      throw new BadRequestException('Object not found in storage — upload may have failed');
    }

    const headBaseType = head.contentType.split(';')[0]?.trim() ?? '';
    if (headBaseType && headBaseType !== declaredContentType) {
      await this.prisma.media.update({ where: { id: mediaId }, data: { status: 'failed' } });
      throw new BadRequestException('Content-type mismatch between declared and uploaded object');
    }

    // Re-validate size (trusting headObject over client claim)
    if (head.size > MAX_UPLOAD_BYTES) {
      await this.prisma.media.update({ where: { id: mediaId }, data: { status: 'failed' } });
      throw new BadRequestException(`Object exceeds max size of ${MAX_UPLOAD_BYTES} bytes`);
    }

    // MC-4X §7: documents (PDF/TXT) skip sharp, but the client's declared content-type is NOT trusted.
    // Download the (≤10 MB) bytes, VERIFY the real content (PDF magic / plain-text is not disguised
    // markup or a NUL-heavy binary), then re-store with Content-Disposition: attachment so the CDN
    // forces download instead of in-origin rendering — killing PDF-embedded JS and sniffing vectors.
    if ((DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(declaredContentType)) {
      const buffer = await this.s3.getObjectBuffer(bucketKey);
      if (!isVerifiedDocument(buffer, declaredContentType)) {
        await this.prisma.media.update({ where: { id: mediaId }, data: { status: 'failed' } });
        await this.s3.deleteObject(bucketKey);
        throw new BadRequestException('Ce document est invalide ou potentiellement dangereux.');
      }
      await this.s3.putObject(bucketKey, buffer, declaredContentType, 'attachment');
      const readyDoc = await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          status: 'ready',
          size: head.size || declaredSize,
          variants: { orig: this.s3.publicUrl(bucketKey) } as never,
        },
      });
      return toMediaResponse(readyDoc as unknown as Record<string, unknown>);
    }

    // Download for dimension check + EXIF strip
    const buffer = await this.s3.getObjectBuffer(bucketKey);
    const metadata = await sharp(buffer).metadata();

    if (
      (metadata.width && metadata.width > MAX_IMAGE_DIMENSION) ||
      (metadata.height && metadata.height > MAX_IMAGE_DIMENSION)
    ) {
      await this.prisma.media.update({ where: { id: mediaId }, data: { status: 'failed' } });
      throw new BadRequestException(`Image dimensions exceed ${MAX_IMAGE_DIMENSION}px`);
    }

    // BE-11: Strip EXIF by re-encoding with sharp (auto-rotates for EXIF orientation, no withMetadata = no EXIF)
    const stripped = await sharp(buffer).rotate().toBuffer();
    await this.s3.putObject(bucketKey, stripped, declaredContentType);

    // Persist real dimensions; keep status=pending (worker flips to ready)
    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        size: head.size || declaredSize,
      },
    });

    // Enqueue image-processing job
    await this.queue.enqueue(
      'image-processing',
      'process-variants',
      { mediaId },
      { idempotencyKey: `media-variants-${mediaId}` },
    );

    return toMediaResponse(updated as unknown as Record<string, unknown>);
  }

  async signedUrl(accountId: string, mediaId: string): Promise<SignedUrlResponse> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException();

    const row = media as unknown as Record<string, unknown>;
    const ttl = SIGNED_URL_TTL();

    if (row['visibility'] === 'public') {
      // Public media: return CDN URL directly
      return { url: this.s3.publicUrl(row['bucketKey'] as string), expiresIn: ttl };
    }

    // Private: owner-gated, plus MC-9's exception — a message attachment is readable by any account that
    // participates in a conversation whose message references this mediaId (one query, no leak: a
    // non-participant/non-owner still gets 403). AD-11 subscriber checks layer on later.
    if (row['ownerId'] !== accountId) {
      const allowed = row['kind'] === 'attachment' && (await this.isConversationAttachmentReadable(accountId, mediaId));
      if (!allowed) throw new ForbiddenException();
    }

    const url = await this.s3.presignGet(row['bucketKey'] as string, ttl);
    return { url, expiresIn: ttl };
  }

  /** MC-9: does `accountId` participate in a conversation whose message references this attachment? */
  private async isConversationAttachmentReadable(accountId: string, mediaId: string): Promise<boolean> {
    const msg = await this.prisma.message.findFirst({
      where: {
        attachmentIds: { has: mediaId },
        conversation: { participants: { some: { accountId } } },
      },
      select: { id: true },
    });
    return msg !== null;
  }

  async getForOwner(accountId: string, mediaId: string): Promise<MediaResponse> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException();
    const row = media as unknown as Record<string, unknown>;
    if (row['ownerId'] !== accountId) throw new ForbiddenException();
    return toMediaResponse(row);
  }

  /** Called by ImageProcessingProcessor — generate variants with sharp, then set status=ready. */
  async processVariants(mediaId: string): Promise<void> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return; // orphaned record — nothing to do

    const row = media as unknown as Record<string, unknown>;
    const bucketKey = row['bucketKey'] as string;
    const kind = row['kind'] as string;
    const ownerId = row['ownerId'] as string;
    const isPublic = row['visibility'] === 'public';

    const buffer = await this.s3.getObjectBuffer(bucketKey);

    const base = sharp(buffer);

    let thumbBuffer: Buffer;
    let webBuffer: Buffer;
    let avifBuffer: Buffer;

    if (kind === 'avatar') {
      // ponytail: square cover crop for avatars — fit:cover fills the square, never squishes
      thumbBuffer = await base.clone().resize(200, 200, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
      webBuffer = await base.clone().resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
      avifBuffer = await base.clone().resize(400, 400, { fit: 'cover' }).avif({ quality: 60 }).toBuffer();
    } else {
      // Non-avatar: preserve aspect ratio
      thumbBuffer = await base.clone().resize(320, undefined, { withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      webBuffer = await base.clone().resize(1280, undefined, { withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      avifBuffer = await base.clone().resize(1280, undefined, { withoutEnlargement: true }).avif({ quality: 60 }).toBuffer();
    }

    const thumbKey = `${kind}/${ownerId}/${mediaId}/thumb.webp`;
    const webKey = `${kind}/${ownerId}/${mediaId}/web.webp`;
    const avifKey = `${kind}/${ownerId}/${mediaId}/web.avif`;

    await this.s3.putObject(thumbKey, thumbBuffer, 'image/webp');
    await this.s3.putObject(webKey, webBuffer, 'image/webp');
    await this.s3.putObject(avifKey, avifBuffer, 'image/avif');

    // For public media: store CDN URLs; for private: store bucket keys (resolved via signedUrl)
    const resolve = (key: string) => (isPublic ? this.s3.publicUrl(key) : key);

    const variants: MediaVariants = {
      orig: resolve(bucketKey),
      web: resolve(webKey),
      thumb: resolve(thumbKey),
      webp: resolve(webKey),
      avif: resolve(avifKey),
    };

    await this.prisma.media.update({
      where: { id: mediaId },
      data: { status: 'ready', variants: variants as never },
    });
  }

  // ── F-14: RGPD helpers ────────────────────────────────────────────────────

  /**
   * Create a private archive Media row + upload buffer to S3.
   * Used by DataExportProcessor to store the user's .zip.
   * Bypasses image pipeline — server-side write, UPLOAD_ALLOWED_CONTENT_TYPES does not apply.
   */
  async createPrivateArchive(
    ownerId: string,
    buffer: Buffer,
    filename: string,
  ): Promise<{ mediaId: string }> {
    const mediaId = randomUUID().replace(/-/g, '');
    const bucketKey = `attachment/${ownerId}/${mediaId}.zip`;

    await this.s3.putObject(bucketKey, buffer, 'application/zip');

    const media = await this.prisma.media.create({
      data: {
        id: mediaId,
        ownerId,
        kind: 'attachment' as never,
        bucketKey,
        contentType: 'application/zip',
        size: buffer.length,
        status: 'ready' as never,
        visibility: 'private' as never,
        variants: {},
      },
    });

    void filename; // ponytail: filename is in the zip itself; bucket key carries the id
    return { mediaId: (media as unknown as Record<string, unknown>)['id'] as string };
  }

  /**
   * Delete a single Media row: best-effort S3 delete (main + variant keys) + DB row delete.
   * Used by export purge (PrivacyService.getExport lazy-expire + purgeExpiredExports).
   */
  async deleteMediaById(mediaId: string): Promise<void> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return;

    const row = media as unknown as Record<string, unknown>;
    const bucketKey = row['bucketKey'] as string;
    const kind = row['kind'] as string;
    const ownerId = row['ownerId'] as string;

    // Best-effort: main key + image variant keys (may not exist for non-image kinds)
    await this.s3.deleteObject(bucketKey).catch(() => {});
    await this.s3.deleteObject(`${kind}/${ownerId}/${mediaId}/thumb.webp`).catch(() => {});
    await this.s3.deleteObject(`${kind}/${ownerId}/${mediaId}/web.webp`).catch(() => {});
    await this.s3.deleteObject(`${kind}/${ownerId}/${mediaId}/web.avif`).catch(() => {});

    await this.prisma.media.deleteMany({ where: { id: mediaId } });
  }

  /**
   * Delete ALL Media rows for an owner across all kinds.
   * Used by AccountErasureProcessor as the S3 best-effort step before the DB transaction.
   */
  async deleteAllOwnerMedia(ownerId: string): Promise<void> {
    const rows = await this.prisma.media.findMany({ where: { ownerId } });
    if (rows.length === 0) return;

    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      const key = r['bucketKey'] as string;
      const id = r['id'] as string;
      const kind = r['kind'] as string;
      // main + known variant keys — best-effort
      await this.s3.deleteObject(key).catch(() => {});
      await this.s3.deleteObject(`${kind}/${ownerId}/${id}/thumb.webp`).catch(() => {});
      await this.s3.deleteObject(`${kind}/${ownerId}/${id}/web.webp`).catch(() => {});
      await this.s3.deleteObject(`${kind}/${ownerId}/${id}/web.avif`).catch(() => {});
    }

    await this.prisma.media.deleteMany({
      where: { id: { in: rows.map((r) => (r as unknown as Record<string, unknown>)['id'] as string) } },
    });
  }

  /**
   * Delete all avatar Media rows for an owner, plus their S3 objects (main + variant keys).
   * Pass exceptId to skip the newly-set media when called from setAvatar.
   * Best-effort S3 deletes — DB rows are always removed.
   */
  async deleteOwnerAvatarMedia(ownerId: string, exceptId?: string): Promise<void> {
    const where = {
      ownerId,
      kind: 'avatar' as never,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    };

    const rows = await this.prisma.media.findMany({ where });
    if (rows.length === 0) return;

    for (const row of rows) {
      const r = row as unknown as Record<string, unknown>;
      const key = r['bucketKey'] as string;
      const id = r['id'] as string;
      // main + known variant keys — best-effort (keys may not exist if status=pending)
      await this.s3.deleteObject(key).catch(() => {});
      await this.s3.deleteObject(`avatar/${ownerId}/${id}/thumb.webp`).catch(() => {});
      await this.s3.deleteObject(`avatar/${ownerId}/${id}/web.webp`).catch(() => {});
      await this.s3.deleteObject(`avatar/${ownerId}/${id}/web.avif`).catch(() => {});
    }

    await this.prisma.media.deleteMany({
      where: { id: { in: rows.map((r) => (r as unknown as Record<string, unknown>)['id'] as string) } },
    });
  }

  /** Scheduled hourly: delete un-finalized pending media older than 1 hour + best-effort S3 cleanup. */
  async cleanupOrphans(): Promise<void> {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await this.prisma.media.findMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
    });

    for (const m of stale) {
      await this.s3.deleteObject((m as unknown as Record<string, unknown>)['bucketKey'] as string).catch(() => {});
    }

    if (stale.length > 0) {
      await this.prisma.media.deleteMany({
        where: { id: { in: stale.map((m) => (m as unknown as Record<string, unknown>)['id'] as string) } },
      });
    }
  }
}
