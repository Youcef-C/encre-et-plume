import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';

const ANON = {} as AuthRequest;
const hc = (o: Partial<{ illustrationIds: Set<string> }> = {}) => ({
  accountIds: new Set<string>(),
  workIds: new Set<string>(),
  workSlugs: new Set<string>(),
  illustrationIds: new Set<string>(),
  ...o,
});

describe('GalleryController', () => {
  let controller: GalleryController;
  let service: {
    findIllustrations: jest.Mock;
    getTrending: jest.Mock;
    getPreview: jest.Mock;
    getIllustration: jest.Mock;
    getMoreByArtist: jest.Mock;
    publishIllustration: jest.Mock;
    getMineIllustrations: jest.Mock;
    updateIllustration: jest.Mock;
  };
  let ageGate: { assertMayView18Plus: jest.Mock };
  let blocks: { hiddenContent: jest.Mock };

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
      publishIllustration: jest.fn().mockResolvedValue({ id: 'newIllu1' }),
      getMineIllustrations: jest.fn().mockResolvedValue([]),
      updateIllustration: jest.fn().mockResolvedValue({ id: 'i1', title: 'Nouveau' }),
    };
    ageGate = { assertMayView18Plus: jest.fn().mockResolvedValue(undefined) };
    blocks = { hiddenContent: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GalleryController],
      providers: [
        { provide: GalleryService, useValue: service },
        { provide: AgeGateService, useValue: ageGate },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SessionGuard)
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
    const result = await controller.illustrations({ category: 'personnages', page: '2' }, ANON);

    expect(service.findIllustrations).toHaveBeenCalledWith(expect.objectContaining({ category: 'personnages', page: 2 }));
    expect(result.total).toBe(0);
  });

  it('GET /illustrations/trending delegates to the service', async () => {
    const result = await controller.trending(ANON);
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

  it('GET /illustrations/:id delegates to getIllustration with the viewer id and returns the detail', async () => {
    const req = { accountId: 'acc-1' } as AuthRequest;
    const result = await controller.illustration('i1', req);

    expect(service.getIllustration).toHaveBeenCalledWith('i1', 'acc-1');
    expect(result).toEqual({ id: 'i1', title: 'Pluie de Néons', is18plus: false });
  });

  it('PATCH /illustrations/:id delegates to updateIllustration with the owner id + body', async () => {
    const req = { accountId: 'acc-1' } as AuthRequest;
    const dto = { title: 'Nouveau' };
    const result = await controller.update('i1', req, dto);

    expect(service.updateIllustration).toHaveBeenCalledWith('acc-1', 'i1', dto);
    expect(result).toEqual({ id: 'i1', title: 'Nouveau' });
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

    const result = await controller.more('i1', ANON);

    expect(service.getMoreByArtist).toHaveBeenCalledWith('i1');
    expect(result).toEqual([{ id: 'i2' }]);
  });

  // ── MC-10 round 2 (B13): blocked-pair illustration hiding ──
  describe('blocked-pair filtering', () => {
    const req = { accountId: 'acc-1' } as AuthRequest;

    it('drops list items in the illustrationIds set; summary stays global', async () => {
      service.findIllustrations.mockResolvedValue({
        items: [{ id: 'i1' }, { id: 'i2' }],
        total: 2,
        page: 1,
        pageSize: 12,
        totalPages: 1,
        summary: { illustrationCount: 2, artistCount: 2 },
      });
      blocks.hiddenContent.mockResolvedValue(hc({ illustrationIds: new Set(['i1']) }));
      const res = await controller.illustrations({}, req);
      expect(res.items).toEqual([{ id: 'i2' }]);
      expect(res.summary).toEqual({ illustrationCount: 2, artistCount: 2 }); // D10 global
    });

    it('drops trending + more cards by id', async () => {
      service.getTrending.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      service.getMoreByArtist.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
      blocks.hiddenContent.mockResolvedValue(hc({ illustrationIds: new Set(['i1']) }));
      expect((await controller.trending(req)).map((c) => c.id)).toEqual(['i2']);
      expect((await controller.more('src', req)).map((c) => c.id)).toEqual(['i2']);
    });

    it('404s detail + preview for a blocked-pair illustration', async () => {
      blocks.hiddenContent.mockResolvedValue(hc({ illustrationIds: new Set(['i1']) }));
      await expect(controller.illustration('i1', req)).rejects.toThrow('Illustration introuvable');
      await expect(controller.preview('i1', req)).rejects.toThrow('Illustration introuvable');
      expect(service.getIllustration).not.toHaveBeenCalled();
      expect(service.getPreview).not.toHaveBeenCalled();
    });

    it('does not consult hiddenContent for an anonymous viewer', async () => {
      await controller.illustrations({}, ANON);
      await controller.illustration('i1', ANON);
      expect(blocks.hiddenContent).not.toHaveBeenCalled();
    });
  });
});
