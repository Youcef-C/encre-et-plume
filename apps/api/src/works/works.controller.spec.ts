import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

describe('WorksController', () => {
  let controller: WorksController;
  let service: { getWork: jest.Mock; getChapters: jest.Mock; getPlanches: jest.Mock; getAudienceRating: jest.Mock };
  let ageGate: { assertMayView18Plus: jest.Mock };
  let blocks: { hiddenAuthorIds: jest.Mock; hiddenContent: jest.Mock };

  beforeEach(async () => {
    service = {
      getWork: jest.fn().mockResolvedValue({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics' }),
      getChapters: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
      getPlanches: jest.fn().mockResolvedValue([]),
      getAudienceRating: jest.fn().mockResolvedValue('Tous publics'),
    };
    ageGate = { assertMayView18Plus: jest.fn().mockResolvedValue(undefined) };
    blocks = {
      hiddenAuthorIds: jest.fn().mockResolvedValue(new Set<string>()),
      hiddenContent: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorksController],
      providers: [
        { provide: WorksService, useValue: service },
        { provide: AgeGateService, useValue: ageGate },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorksController>(WorksController);
  });

  it('is public — no class-level guards (chapters stay fully public; planches gets a method-level guard, H2)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorksController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /works/:slug applies OptionalSessionGuard at the method level (DR-10 BE-6)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorksController.prototype.getWork) as unknown[] | undefined;
    expect(guards).toContain(OptionalSessionGuard);
  });

  it('GET /works/:slug delegates to getWork', async () => {
    const req = {} as AuthRequest;
    const result = await controller.getWork('lames-de-brume', req);
    expect(service.getWork).toHaveBeenCalledWith('lames-de-brume');
    expect(result).toEqual({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics' });
  });

  it('GET /works/:slug throws NotFoundException when the work is missing', async () => {
    service.getWork.mockResolvedValue(null);
    const req = {} as AuthRequest;
    await expect(controller.getWork('inconnu', req)).rejects.toThrow(NotFoundException);
  });

  describe('DR-10: 18+ age gate on work detail', () => {
    it('does not call the age gate for a non-18+ work', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: 'Tous publics' });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.getWork('x', req);

      expect(ageGate.assertMayView18Plus).not.toHaveBeenCalled();
    });

    it('calls the age gate with req.accountId for an 18+ work', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.getWork('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1', undefined);
    });

    it('calls the age gate with undefined accountId for a visitor on an 18+ work', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      const req = {} as AuthRequest;

      await controller.getWork('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith(undefined, undefined);
    });

    // B-5: the guard marks a request whose identity Redis could not resolve. If the controller
    // dropped that flag, the age gate would see a plain visitor and wave an unverifiable caller
    // through — the exact bypass this wiring exists to close.
    it('forwards identityDegraded so the gate can refuse an unresolvable caller', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      const req = { identityDegraded: true } as AuthRequest;

      await controller.getWork('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith(undefined, true);
    });

    it('propagates the 403 thrown by the age gate (logged-in minor)', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));
      const req = { accountId: 'acc-minor' } as AuthRequest;

      await expect(controller.getWork('x', req)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('MC-10: per-viewer review filtering', () => {
    const workWithReviews = () => ({
      id: 'w1',
      slug: 'lames-de-brume',
      audienceRating: 'Tous publics',
      reviews: [
        { id: 'r1', authorId: 'muted-author', authorName: 'M', text: 'x', hidden: false },
        { id: 'r2', authorId: null, authorName: 'Anon', text: 'y', hidden: false },
        { id: 'r3', authorId: 'other', authorName: 'O', text: 'z', hidden: false },
      ],
    });

    it('filters out reviews whose author the signed-in viewer blocked/muted', async () => {
      service.getWork.mockResolvedValue(workWithReviews());
      blocks.hiddenAuthorIds.mockResolvedValue(new Set(['muted-author']));
      const res = await controller.getWork('lames-de-brume', { accountId: 'acc-1' } as AuthRequest);
      expect(blocks.hiddenAuthorIds).toHaveBeenCalledWith('acc-1');
      expect(res.reviews.map((r) => r.id)).toEqual(['r2', 'r3']); // null-author never filtered
    });

    it('does not touch reviews for an anonymous viewer (no accountId)', async () => {
      service.getWork.mockResolvedValue(workWithReviews());
      const res = await controller.getWork('lames-de-brume', {} as AuthRequest);
      expect(blocks.hiddenAuthorIds).not.toHaveBeenCalled();
      expect(res.reviews).toHaveLength(3);
    });

    it('never mutates the cached work object (spread-copy)', async () => {
      const cached = workWithReviews();
      service.getWork.mockResolvedValue(cached);
      blocks.hiddenAuthorIds.mockResolvedValue(new Set(['muted-author']));
      await controller.getWork('lames-de-brume', { accountId: 'acc-1' } as AuthRequest);
      expect(cached.reviews).toHaveLength(3); // original untouched
    });

    it('returns the work untouched when the viewer has no blocks', async () => {
      service.getWork.mockResolvedValue(workWithReviews());
      const res = await controller.getWork('lames-de-brume', { accountId: 'acc-1' } as AuthRequest);
      expect(res.reviews).toHaveLength(3);
    });
  });

  describe('MC-10 round 2: mutual work hiding (B11)', () => {
    const hc = (o: Partial<{ workIds: Set<string>; workSlugs: Set<string> }> = {}) => ({
      accountIds: new Set<string>(),
      workIds: new Set<string>(),
      workSlugs: new Set<string>(),
      illustrationIds: new Set<string>(),
      ...o,
    });

    it('GET /works/:slug 404s Œuvre introuvable when the work is in the blocked-pair set', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics', reviews: [] });
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['w1']) }));
      await expect(controller.getWork('lames-de-brume', { accountId: 'acc-1' } as AuthRequest)).rejects.toThrow(
        'Œuvre introuvable',
      );
    });

    it('GET /works/:slug returns the work for a viewer whose block set does not include it', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics', reviews: [] });
      blocks.hiddenContent.mockResolvedValue(hc({ workIds: new Set(['other']) }));
      const res = await controller.getWork('lames-de-brume', { accountId: 'acc-1' } as AuthRequest);
      expect(res.id).toBe('w1');
    });

    it('GET /works/:slug does not consult hiddenContent for an anonymous viewer', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics', reviews: [] });
      await controller.getWork('lames-de-brume', {} as AuthRequest);
      expect(blocks.hiddenContent).not.toHaveBeenCalled();
    });

    it('GET /works/:slug/chapters 404s when the slug is in the blocked-pair set', async () => {
      blocks.hiddenContent.mockResolvedValue(hc({ workSlugs: new Set(['lames-de-brume']) }));
      await expect(controller.getChapters('lames-de-brume', { accountId: 'acc-1' } as AuthRequest, '1')).rejects.toThrow(
        'Œuvre introuvable',
      );
    });

    it('GET /works/:slug/chapters applies OptionalSessionGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, WorksController.prototype.getChapters) as unknown[] | undefined;
      expect(guards).toContain(OptionalSessionGuard);
    });

    it('GET /works/:slug/planches 404s when the slug is in the blocked-pair set', async () => {
      blocks.hiddenContent.mockResolvedValue(hc({ workSlugs: new Set(['lames-de-brume']) }));
      await expect(controller.getPlanches('lames-de-brume', { accountId: 'acc-1' } as AuthRequest)).rejects.toThrow(
        'Œuvre introuvable',
      );
    });
  });

  it('GET /works/:slug/chapters delegates to getChapters with the parsed page', async () => {
    const result = await controller.getChapters('lames-de-brume', {} as AuthRequest, '3');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 3);
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('GET /works/:slug/chapters clamps a missing/invalid page to 1', async () => {
    await controller.getChapters('lames-de-brume', {} as AuthRequest, undefined);
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', {} as AuthRequest, 'abc');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', {} as AuthRequest, '0');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);
  });

  it('GET /works/:slug/chapters throws NotFoundException when the work is missing', async () => {
    service.getChapters.mockResolvedValue(null);
    await expect(controller.getChapters('inconnu', {} as AuthRequest, '1')).rejects.toThrow(NotFoundException);
  });

  it('GET /works/:slug/planches applies OptionalSessionGuard at the method level (H2)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorksController.prototype.getPlanches) as unknown[] | undefined;
    expect(guards).toContain(OptionalSessionGuard);
  });

  it('GET /works/:slug/planches delegates to getPlanches', async () => {
    service.getPlanches.mockResolvedValue([{ id: 'p1', image: null, caption: null }]);
    const req = {} as AuthRequest;
    const result = await controller.getPlanches('lames-de-brume', req);
    expect(service.getPlanches).toHaveBeenCalledWith('lames-de-brume');
    expect(result).toEqual([{ id: 'p1', image: null, caption: null }]);
  });

  it('GET /works/:slug/planches throws NotFoundException when the work is missing', async () => {
    service.getPlanches.mockResolvedValue(null);
    const req = {} as AuthRequest;
    await expect(controller.getPlanches('inconnu', req)).rejects.toThrow(NotFoundException);
  });

  describe('H2: 18+ age gate on planches', () => {
    it('does not call the age gate for a non-18+ work', async () => {
      service.getPlanches.mockResolvedValue([]);
      service.getAudienceRating.mockResolvedValue('Tous publics');
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.getPlanches('x', req);

      expect(ageGate.assertMayView18Plus).not.toHaveBeenCalled();
    });

    it('calls the age gate with req.accountId for an 18+ work', async () => {
      service.getPlanches.mockResolvedValue([]);
      service.getAudienceRating.mockResolvedValue('18+');
      const req = { accountId: 'acc-1' } as AuthRequest;

      await controller.getPlanches('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1', undefined);
    });

    it('calls the age gate with undefined accountId for a visitor on an 18+ work', async () => {
      service.getPlanches.mockResolvedValue([]);
      service.getAudienceRating.mockResolvedValue('18+');
      const req = {} as AuthRequest;

      await controller.getPlanches('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith(undefined, undefined);
    });

    it('propagates the 403 thrown by the age gate (logged-in minor)', async () => {
      service.getPlanches.mockResolvedValue([]);
      service.getAudienceRating.mockResolvedValue('18+');
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));
      const req = { accountId: 'acc-minor' } as AuthRequest;

      await expect(controller.getPlanches('x', req)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
