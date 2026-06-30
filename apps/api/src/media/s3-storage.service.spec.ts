/**
 * S3StorageService unit tests — mocking the AWS SDK so no live storage is needed in CI.
 *
 * Key contracts under test:
 *   1. forcePathStyle: true ONLY when S3_ENDPOINT is set (MinIO/local)
 *   2. publicUrl composes CDN_BASE_URL/key correctly
 *   3. presignPut binds ContentType + ContentLength in the command
 */

// ── Mock @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner BEFORE imports ──
const mockPresignedUrl = jest.fn().mockResolvedValue('https://minio/presigned');

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(function (this: Record<string, unknown>, cfg: unknown) {
    (this as Record<string, unknown>)['_cfg'] = cfg;
    (this as Record<string, unknown>)['send'] = jest.fn();
  }),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ _type: 'PutObjectCommand', input })),
  HeadObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ _type: 'HeadObjectCommand', input })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ _type: 'GetObjectCommand', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ _type: 'DeleteObjectCommand', input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockPresignedUrl,
}));

// Grab references to mocks AFTER jest.mock() calls (hoisted) — same module instance the service uses
const { S3Client, PutObjectCommand } = jest.requireMock<{
  S3Client: jest.Mock;
  PutObjectCommand: jest.Mock;
}>('@aws-sdk/client-s3');

import { S3StorageService } from './s3-storage.service';

describe('S3StorageService', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...origEnv };
    mockPresignedUrl.mockResolvedValue('https://minio/presigned');
  });

  afterAll(() => {
    process.env = origEnv;
  });

  describe('forcePathStyle', () => {
    it('is true when S3_ENDPOINT is set (MinIO / custom)', () => {
      process.env['S3_ENDPOINT'] = 'http://localhost:9000';
      process.env['S3_REGION'] = 'us-east-1';
      process.env['S3_BUCKET'] = 'test-bucket';
      process.env['S3_ACCESS_KEY_ID'] = 'key';
      process.env['S3_SECRET_ACCESS_KEY'] = 'secret';

      new S3StorageService();

      const cfg = S3Client.mock.calls[0][0] as Record<string, unknown>;
      expect(cfg['forcePathStyle']).toBe(true);
    });

    it('is absent (undefined/false) when S3_ENDPOINT is empty (AWS S3)', () => {
      process.env['S3_ENDPOINT'] = '';
      process.env['S3_REGION'] = 'eu-west-1';
      process.env['S3_BUCKET'] = 'prod-bucket';
      process.env['S3_ACCESS_KEY_ID'] = 'key';
      process.env['S3_SECRET_ACCESS_KEY'] = 'secret';

      new S3StorageService();

      const cfg = S3Client.mock.calls[0][0] as Record<string, unknown>;
      expect(cfg['forcePathStyle']).toBeFalsy();
    });
  });

  describe('publicUrl', () => {
    it('composes CDN_BASE_URL/key', () => {
      process.env['CDN_BASE_URL'] = 'http://localhost:9000/encre-et-plume-media';
      process.env['S3_BUCKET'] = 'encre-et-plume-media';
      const svc = new S3StorageService();
      expect(svc.publicUrl('avatar/acc-1/abc.jpg')).toBe(
        'http://localhost:9000/encre-et-plume-media/avatar/acc-1/abc.jpg',
      );
    });
  });

  describe('presignPut', () => {
    it('calls getSignedUrl with ContentType and ContentLength bound in command', async () => {
      process.env['S3_BUCKET'] = 'encre-et-plume-media';
      const svc = new S3StorageService();

      await svc.presignPut('my/key.jpg', 'image/jpeg', 4096, 300);

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'image/jpeg',
          ContentLength: 4096,
          Key: 'my/key.jpg',
        }),
      );
      expect(mockPresignedUrl).toHaveBeenCalled();
    });

    it('returns the presigned URL string from getSignedUrl', async () => {
      process.env['S3_BUCKET'] = 'encre-et-plume-media';
      const svc = new S3StorageService();

      const url = await svc.presignPut('k', 'image/png', 100, 300);

      expect(url).toBe('https://minio/presigned');
    });
  });
});
