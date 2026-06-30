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
const PRIVATE_KINDS = new Set<MediaKind>(['attachment', 'chapter_page']);

const SIGNED_URL_TTL = () => Number(process.env['MEDIA_SIGNED_URL_TTL'] ?? 300);

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
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
    // Validate contentType allowlist (SVG excluded — XSS risk)
    if (!(UPLOAD_ALLOWED_CONTENT_TYPES as readonly string[]).includes(dto.contentType)) {
      throw new BadRequestException(`contentType not allowed: ${dto.contentType}`);
    }
    // Validate size
    if (dto.size <= 0 || dto.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`size must be between 1 and ${MAX_UPLOAD_BYTES} bytes`);
    }

    // Redis rate-limit: skip when DISABLE_RATE_LIMIT=true (CI / tests)
    if (process.env['DISABLE_RATE_LIMIT'] !== 'true') {
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

    // Private: owner-gated now (seam: AD-11 participant/subscriber checks added by consuming story)
    if (row['ownerId'] !== accountId) throw new ForbiddenException();

    const url = await this.s3.presignGet(row['bucketKey'] as string, ttl);
    return { url, expiresIn: ttl };
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
