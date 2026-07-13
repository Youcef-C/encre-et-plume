/**
 * ImageProcessingProcessor unit tests.
 * Uses REAL sharp on a tiny in-memory buffer (avoids mocking sharp's API).
 * S3 putObject and Prisma are mocked.
 */

import type { Job } from 'bullmq';
import { ImageProcessingProcessor } from './image-processing.processor';
import { MediaService } from '../../media/media.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../../media/s3-storage.service';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';
import sharp from 'sharp';

describe('ImageProcessingProcessor', () => {
  let processor: ImageProcessingProcessor;
  let mediaService: { processVariants: jest.Mock; cleanupOrphans: jest.Mock; processDocxPreview: jest.Mock };

  beforeEach(() => {
    mediaService = {
      processVariants: jest.fn().mockResolvedValue(undefined),
      cleanupOrphans: jest.fn().mockResolvedValue(undefined),
      processDocxPreview: jest.fn().mockResolvedValue(undefined),
    };
    processor = new ImageProcessingProcessor(mediaService as unknown as MediaService);
  });

  it('has queue = "image-processing"', () => {
    expect(processor.queue).toBe('image-processing');
  });

  describe('process-variants job', () => {
    it('delegates to mediaService.processVariants(mediaId)', async () => {
      const job = { name: 'process-variants', attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job;

      await processor.process({ mediaId: 'media-1' }, job);

      expect(mediaService.processVariants).toHaveBeenCalledWith('media-1');
      expect(mediaService.cleanupOrphans).not.toHaveBeenCalled();
    });

    it('re-throws on error so WorkerRunner can dead-letter on final attempt', async () => {
      const err = new Error('sharp failed');
      mediaService.processVariants.mockRejectedValue(err);
      const job = { name: 'process-variants', attemptsMade: 2, opts: { attempts: 3 } } as unknown as Job;

      await expect(processor.process({ mediaId: 'media-1' }, job)).rejects.toThrow('sharp failed');
    });
  });

  describe('orphan-cleanup job', () => {
    it('delegates to mediaService.cleanupOrphans()', async () => {
      const job = { name: 'orphan-cleanup', attemptsMade: 0, opts: { attempts: 1 } } as unknown as Job;

      await processor.process({}, job);

      expect(mediaService.cleanupOrphans).toHaveBeenCalled();
      expect(mediaService.processVariants).not.toHaveBeenCalled();
    });
  });

  describe('docx-preview job (CS-3)', () => {
    it('delegates to mediaService.processDocxPreview(mediaId)', async () => {
      const job = { name: 'docx-preview', attemptsMade: 0, opts: { attempts: 3 } } as unknown as Job;

      await processor.process({ mediaId: 'media-docx' }, job);

      expect(mediaService.processDocxPreview).toHaveBeenCalledWith('media-docx');
      expect(mediaService.processVariants).not.toHaveBeenCalled();
    });
  });

  describe('processDocxPreview: sanitizes mammoth output (real service, mocked mammoth/S3/Prisma)', () => {
    it('strips <script>, on* handlers and javascript: urls, stores preview.html, merges variants.preview', async () => {
      jest.resetModules();
      jest.doMock('mammoth', () => ({
        __esModule: true,
        default: {
          convertToHtml: jest.fn().mockResolvedValue({
            value: '<p onclick="steal()">hi</p><script>evil()</script><a href="javascript:evil()">x</a>',
            messages: [],
          }),
        },
        convertToHtml: jest.fn().mockResolvedValue({
          value: '<p onclick="steal()">hi</p><script>evil()</script><a href="javascript:evil()">x</a>',
          messages: [],
        }),
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MediaService: FreshMediaService } = require('../../media/media.service');

      const captured: Array<[string, Buffer, string, string?]> = [];
      const s3Mock = {
        getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
        putObject: jest.fn().mockImplementation((k: string, b: Buffer, ct: string, cd?: string) => {
          captured.push([k, b, ct, cd]);
          return Promise.resolve();
        }),
        publicUrl: jest.fn((k: string) => `https://cdn/${k}`),
        presignPut: jest.fn(),
        headObject: jest.fn(),
        deleteObject: jest.fn(),
        presignGet: jest.fn(),
      };
      const docxMedia = {
        id: 'media-docx',
        ownerId: 'acc-1',
        kind: 'asset',
        bucketKey: 'asset/acc-1/media-docx.docx',
        variants: { orig: 'asset/acc-1/media-docx.docx' },
      };
      const prismaMock = {
        media: {
          findUnique: jest.fn().mockResolvedValue(docxMedia),
          update: jest.fn().mockResolvedValue(docxMedia),
        },
      };
      const service = new FreshMediaService(
        prismaMock as unknown as PrismaService,
        s3Mock as unknown as S3StorageService,
        { incr: jest.fn(), expire: jest.fn() } as unknown as RedisService,
        { enqueue: jest.fn(), schedule: jest.fn() } as unknown as QueueService,
      );

      await service.processDocxPreview('media-docx');

      const previewPut = captured.find(([k]) => k.endsWith('preview.html'));
      expect(previewPut).toBeDefined();
      const html = previewPut![1].toString('utf8');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('javascript:');
      const updateCall = prismaMock.media.update.mock.calls[0][0] as { data: { variants: Record<string, string> } };
      expect(updateCall.data.variants.preview).toBe('asset/acc-1/media-docx/preview.html');
      jest.dontMock('mammoth');
    });
  });

  describe('processVariants integration: avatar square cover crop (real sharp)', () => {
    it('produces square thumb and web variants for kind=avatar on a non-square source', async () => {
      // Non-square 60x20 JPEG — will be squished if fit is not cover
      const nonSquareBuffer = await sharp({
        create: { width: 60, height: 20, channels: 3, background: '#0000ff' },
      })
        .jpeg()
        .toBuffer();

      const capturedPuts: Array<[string, Buffer, string]> = [];
      const s3AvatarMock = {
        getObjectBuffer: jest.fn().mockResolvedValue(nonSquareBuffer),
        putObject: jest.fn().mockImplementation((key: string, buf: Buffer, ct: string) => {
          capturedPuts.push([key, buf, ct]);
          return Promise.resolve();
        }),
        publicUrl: jest.fn((key: string) => `https://cdn/${key}`),
        presignPut: jest.fn(),
        headObject: jest.fn(),
        deleteObject: jest.fn(),
        presignGet: jest.fn(),
      };

      const mockAvatarMedia = {
        id: 'media-av',
        ownerId: 'acc-1',
        kind: 'avatar',
        bucketKey: 'avatar/acc-1/media-av.jpg',
        status: 'pending',
        variants: {},
        visibility: 'public',
        createdAt: new Date(),
      };

      const prismaMock = {
        media: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(mockAvatarMedia),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...mockAvatarMedia, ...data }),
          ),
          deleteMany: jest.fn(),
          findMany: jest.fn(),
        },
      };

      const redisMock = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
      const queueMock = { enqueue: jest.fn(), schedule: jest.fn() };

      const realService = new MediaService(
        prismaMock as unknown as PrismaService,
        s3AvatarMock as unknown as S3StorageService,
        redisMock as unknown as RedisService,
        queueMock as unknown as QueueService,
      );

      await realService.processVariants('media-av');

      // Find thumb and web buffers
      const thumbCall = capturedPuts.find(([key]) => key.includes('thumb'));
      const webCall = capturedPuts.find(([key]) => key.includes('web.webp'));
      expect(thumbCall).toBeDefined();
      expect(webCall).toBeDefined();

      const thumbMeta = await sharp(thumbCall![1]).metadata();
      const webMeta = await sharp(webCall![1]).metadata();

      // Must be square (width === height) — cover crop enforced
      expect(thumbMeta.width).toBe(thumbMeta.height);
      expect(webMeta.width).toBe(webMeta.height);
    });
  });

  describe('processVariants integration (real sharp + mock S3 / Prisma)', () => {
    it('produces webp/avif variants and sets status=ready', async () => {
      // Create a tiny 20x20 JPEG buffer
      const jpegBuffer = await sharp({
        create: { width: 20, height: 20, channels: 3, background: '#ff0000' },
      })
        .jpeg()
        .toBuffer();

      const s3Mock = {
        getObjectBuffer: jest.fn().mockResolvedValue(jpegBuffer),
        putObject: jest.fn().mockResolvedValue(undefined),
        publicUrl: jest.fn((key: string) => `https://cdn/${key}`),
        presignPut: jest.fn(),
        headObject: jest.fn(),
        deleteObject: jest.fn(),
        presignGet: jest.fn(),
      };

      const mockMedia = {
        id: 'media-1',
        ownerId: 'acc-1',
        kind: 'avatar',
        bucketKey: 'avatar/acc-1/media-1.jpg',
        contentType: 'image/jpeg',
        size: jpegBuffer.length,
        width: 20,
        height: 20,
        status: 'pending',
        variants: {},
        visibility: 'public',
        createdAt: new Date(),
      };

      const prismaMock = {
        media: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue(mockMedia),
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...mockMedia, ...data }),
          ),
          deleteMany: jest.fn(),
          findMany: jest.fn(),
        },
      };

      const redisMock = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() };
      const queueMock = { enqueue: jest.fn(), schedule: jest.fn() };

      const realService = new MediaService(
        prismaMock as unknown as PrismaService,
        s3Mock as unknown as S3StorageService,
        redisMock as unknown as RedisService,
        queueMock as unknown as QueueService,
      );

      await realService.processVariants('media-1');

      // Should have uploaded at least thumb and web variants
      const putCalls = s3Mock.putObject.mock.calls as [string, Buffer, string][];
      expect(putCalls.length).toBeGreaterThanOrEqual(2);

      // At least one call with webp content type
      const hasWebp = putCalls.some(([, , ct]) => ct === 'image/webp');
      expect(hasWebp).toBe(true);

      // Prisma updated to ready with variants populated
      const updateCall = prismaMock.media.update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(updateCall.data['status']).toBe('ready');
      const variants = updateCall.data['variants'] as Record<string, unknown>;
      expect(variants).toHaveProperty('orig');
      expect(variants).toHaveProperty('web');
      expect(variants).toHaveProperty('thumb');
    });
  });
});
