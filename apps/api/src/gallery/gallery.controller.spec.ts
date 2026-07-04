import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

describe('GalleryController', () => {
  let controller: GalleryController;
  let service: {
    findIllustrations: jest.Mock;
    getTrending: jest.Mock;
    getPreview: jest.Mock;
    getIllustration: jest.Mock;
    getMoreByArtist: jest.Mock;
  };
  let ageGate: { assertMayView18Plus: jest.Mock };

  beforeEach(async () => {
    service = {
      findIllustrations: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 12,
        totalPages: 0,
        summary: { illustrationCount: 0, artistCount: 0 },
      }),
      getTrending: jest.fn().mockResolvedValue([{ id: 'i1', rank: 1 }]),
      getPreview: jest.fn().mockResolvedValue({ id: 'i1', title: 'Pluie de Néons' }),
      getIllustration: jest.fn().mockResolvedValue({ id: 'i1', title: 'Pluie de Néons', is18plus: false }),
      getMoreByArtist: jest.fn().mockResolvedValue([]),
    };
    ageGate = { assertMayView18Plus: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GalleryController],
      providers: [
        { provide: GalleryService, useValue: service },
        { provide: AgeGateService, useValue: ageGate },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GalleryController>(GalleryController);
  });

  it('is public — no class-level guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GalleryController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /illustrations/:id applies OptionalSessionGuard at the method level (DR-10 BE-6)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GalleryController.prototype.illustration) as unknown[] | undefined;
    expect(guards).toContain(OptionalSessionGuard);
  });

  it('GET /illustrations parses the query and delegates to findIllustrations', async () => {
    const result = await controller.illustrations({ category: 'personnages', page: '2' });

    expect(service.findIllustrations).toHaveBeenCalledWith(expect.objectContaining({ category: 'personnages', page: 2 }));
    expect(result.total).toBe(0);
  });

  it('GET /illustrations/trending delegates to the service', async () => {
    const result = await controller.trending();
    expect(service.getTrending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'i1', rank: 1 }]);
  });

  it('GET /illustrations/:id/preview applies OptionalSessionGuard at the method level (H2)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GalleryController.prototype.preview) as unknown[] | undefined;
    expect(guards).toContain(OptionalSessionGuard);
  });

  it('GET /illustrations/:id/preview delegates to the service', async () => {
    const req = {} as AuthRequest;
    const result = await controller.preview('i1', req);
    expect(service.getPreview).toHaveBeenCalledWith('i1');
    expect(result).toEqual({ id: 'i1', title: 'Pluie de Néons' });
  });

  it('GET /illustrations/:id/preview propagates a 404 for an unknown id', async () => {
    service.getPreview.mockRejectedValue(new NotFoundException('Illustration nope not found'));
    const req = {} as AuthRequest;

    await expect(controller.preview('nope', req)).rejects.toThrow(NotFoundException);
  });

  describe('H2: 18+ age gate on illustration preview', () => {
    it('does not call the age gate when is18plus is false', async () => {
      service.getPreview.mockResolvedValue({ id: 'i1', is18plus: false });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.preview('i1', req);

      expect(ageGate.assertMayView18Plus).not.toHaveBeenCalled();
    });

    it('calls the age gate with req.accountId when is18plus is true', async () => {
      service.getPreview.mockResolvedValue({ id: 'i1', is18plus: true });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.preview('i1', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1');
    });

    it('calls the age gate with undefined accountId for a visitor', async () => {
      service.getPreview.mockResolvedValue({ id: 'i1', is18plus: true });
      const req = {} as AuthRequest;

      await controller.preview('i1', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith(undefined);
    });

    it('propagates the 403 thrown by the age gate (logged-in minor)', async () => {
      service.getPreview.mockResolvedValue({ id: 'i1', is18plus: true });
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));
      const req = { accountId: 'acc-minor' } as AuthRequest;

      await expect(controller.preview('i1', req)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('GET /illustrations/:id delegates to getIllustration and returns the detail', async () => {
    const req = {} as AuthRequest;
    const result = await controller.illustration('i1', req);

    expect(service.getIllustration).toHaveBeenCalledWith('i1');
    expect(result).toEqual({ id: 'i1', title: 'Pluie de Néons', is18plus: false });
  });

  it('GET /illustrations/:id throws a 404 when the service returns null (missing/unpublished)', async () => {
    service.getIllustration.mockResolvedValue(null);
    const req = {} as AuthRequest;

    await expect(controller.illustration('nope', req)).rejects.toThrow(NotFoundException);
  });

  describe('DR-10: 18+ age gate on illustration detail', () => {
    it('does not call the age gate when is18plus is false', async () => {
      service.getIllustration.mockResolvedValue({ id: 'i1', is18plus: false });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.illustration('i1', req);

      expect(ageGate.assertMayView18Plus).not.toHaveBeenCalled();
    });

    it('calls the age gate with req.accountId when is18plus is true', async () => {
      service.getIllustration.mockResolvedValue({ id: 'i1', is18plus: true });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.illustration('i1', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1');
    });

    it('propagates the 403 thrown by the age gate (logged-in minor)', async () => {
      service.getIllustration.mockResolvedValue({ id: 'i1', is18plus: true });
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));
      const req = { accountId: 'acc-minor' } as AuthRequest;

      await expect(controller.illustration('i1', req)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('GET /illustrations/:id/more delegates to getMoreByArtist', async () => {
    service.getMoreByArtist.mockResolvedValue([{ id: 'i2' }]);

    const result = await controller.more('i1');

    expect(service.getMoreByArtist).toHaveBeenCalledWith('i1');
    expect(result).toEqual([{ id: 'i2' }]);
  });
});
