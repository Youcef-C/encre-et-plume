/**
 * MediaController unit tests — verifies guard wiring and delegation to MediaService.
 * Auth in integration is covered by e2e; here we test the controller layer only.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';

const MEDIA_RESPONSE = {
  id: 'media-1',
  kind: 'avatar' as const,
  status: 'pending' as const,
  visibility: 'public' as const,
  width: null,
  height: null,
  variants: {},
  createdAt: '2026-06-01T00:00:00.000Z',
};

const UPLOAD_RESPONSE = {
  mediaId: 'media-1',
  uploadUrl: 'https://minio/presigned',
  bucketKey: 'avatar/acc-1/media-1.jpg',
  expiresIn: 300,
};

describe('MediaController', () => {
  let controller: MediaController;
  let service: {
    requestUpload: jest.Mock;
    finalize: jest.Mock;
    getForOwner: jest.Mock;
    signedUrl: jest.Mock;
  };

  const fakeReq = { accountId: 'acc-1' } as AuthRequest;

  beforeEach(async () => {
    service = {
      requestUpload: jest.fn().mockResolvedValue(UPLOAD_RESPONSE),
      finalize: jest.fn().mockResolvedValue(MEDIA_RESPONSE),
      getForOwner: jest.fn().mockResolvedValue(MEDIA_RESPONSE),
      signedUrl: jest.fn().mockResolvedValue({ url: 'https://minio/signed', expiresIn: 300 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        { provide: MediaService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MediaController>(MediaController);
  });

  it('POST /media/uploads delegates to service.requestUpload', async () => {
    const dto = { kind: 'avatar' as const, contentType: 'image/jpeg', size: 1024 };
    const result = await controller.requestUpload(fakeReq, dto);
    expect(service.requestUpload).toHaveBeenCalledWith('acc-1', dto);
    expect(result).toEqual(UPLOAD_RESPONSE);
  });

  it('POST /media/:id/finalize delegates to service.finalize', async () => {
    const result = await controller.finalize(fakeReq, 'media-1');
    expect(service.finalize).toHaveBeenCalledWith('acc-1', 'media-1');
    expect(result).toEqual(MEDIA_RESPONSE);
  });

  it('GET /media/:id delegates to service.getForOwner', async () => {
    const result = await controller.getOne(fakeReq, 'media-1');
    expect(service.getForOwner).toHaveBeenCalledWith('acc-1', 'media-1');
    expect(result).toEqual(MEDIA_RESPONSE);
  });

  it('GET /media/:id/url delegates to service.signedUrl', async () => {
    const result = await controller.getSignedUrl(fakeReq, 'media-1');
    expect(service.signedUrl).toHaveBeenCalledWith('acc-1', 'media-1');
    expect(result).toEqual({ url: 'https://minio/signed', expiresIn: 300 });
  });

  it('propagates NotFoundException from service', async () => {
    service.getForOwner.mockRejectedValue(new NotFoundException());
    await expect(controller.getOne(fakeReq, 'bad')).rejects.toBeInstanceOf(NotFoundException);
  });
});
