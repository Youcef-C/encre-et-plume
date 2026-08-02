import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Un objet média n'est JAMAIS réécrit sous une clé déjà servie : `bucketKey` vaut
 * `${kind}/${accountId}/${uuidv7()}.${ext}` et les dérivés en dérivent — une nouvelle version produit
 * une nouvelle clé. C'est la condition qui rend `immutable` sûr : le navigateur ne revalide plus du
 * tout, et le CDN sert depuis son cache pendant un an.
 *
 * C'est le levier de coût principal d'une plateforme de manga : une planche est lourde, lue par
 * beaucoup de monde, et ne change jamais après publication. Sans en-tête, chaque lecture repart vers
 * l'origine ; avec, la même planche n'est payée qu'une fois par point de présence.
 *
 * `immutable` supprime aussi les requêtes conditionnelles (304) : ce n'est pas seulement la bande
 * passante qui est économisée, c'est l'aller-retour lui-même.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

/**
 * Provider-agnostic S3 client.
 * - forcePathStyle: true ONLY when S3_ENDPOINT is set (MinIO / R2-custom).
 *   Real AWS S3 (empty endpoint) omits it — a wrong toggle silently breaks presigns.
 * - publicUrl: CDN_BASE_URL/key (CDN fronts the bucket).
 * - All byte-level reads/writes go through here; MediaService never holds large buffers
 *   longer than the finalize re-encode + processVariants window.
 */
@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBase: string;

  constructor() {
    const endpoint = process.env['S3_ENDPOINT'] ?? '';
    this.bucket = process.env['S3_BUCKET'] ?? 'encre-et-plume-media';
    this.cdnBase = (process.env['CDN_BASE_URL'] ?? '').replace(/\/$/, '');

    this.client = new S3Client({
      region: process.env['S3_REGION'] ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? '',
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  /** Presigned PUT URL for direct client→storage upload. Binds ContentType + ContentLength. */
  async presignPut(key: string, contentType: string, size: number, ttl: number): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: ttl });
  }

  /** Head the object to confirm existence, contentType, and size. Throws on missing key. */
  async headObject(key: string): Promise<{ contentType: string; size: number }> {
    const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(cmd);
    return {
      contentType: res.ContentType ?? '',
      size: res.ContentLength ?? 0,
    };
  }

  /** Download the full object as a Buffer (small files only — media variants + EXIF strip). */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.client.send(cmd);
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Upload a buffer. Used for EXIF-stripped originals, generated variants, and (with
   * contentDisposition='attachment') verified document originals — S3/MinIO stores the disposition
   * as object metadata and replays it on GET, forcing download over in-origin rendering.
   */
  async putObject(key: string, buffer: Buffer, contentType: string, contentDisposition?: string): Promise<void> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    });
    await this.client.send(cmd);
  }

  async deleteObject(key: string): Promise<void> {
    const cmd = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
    await this.client.send(cmd).catch(() => {}); // best-effort
  }

  publicUrl(key: string): string {
    return `${this.cdnBase}/${key}`;
  }

  /** Presigned GET URL for private media (short-lived). */
  async presignGet(key: string, ttl: number): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: ttl });
  }
}
