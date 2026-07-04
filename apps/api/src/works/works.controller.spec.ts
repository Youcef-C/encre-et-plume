import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

describe('WorksController', () => {
  let controller: WorksController;
  let service: { getWork: jest.Mock; getChapters: jest.Mock; getPlanches: jest.Mock };
  let ageGate: { assertMayView18Plus: jest.Mock };

  beforeEach(async () => {
    service = {
      getWork: jest.fn().mockResolvedValue({ id: 'w1', slug: 'lames-de-brume', audienceRating: 'Tous publics' }),
      getChapters: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
      getPlanches: jest.fn().mockResolvedValue([]),
    };
    ageGate = { assertMayView18Plus: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorksController],
      providers: [
        { provide: WorksService, useValue: service },
        { provide: AgeGateService, useValue: ageGate },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorksController>(WorksController);
  });

  it('is public — no class-level guards (chapters/planches stay fully public)', () => {
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

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith('acc-1');
    });

    it('calls the age gate with undefined accountId for a visitor on an 18+ work', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      const req = {} as AuthRequest;

      await controller.getWork('x', req);

      expect(ageGate.assertMayView18Plus).toHaveBeenCalledWith(undefined);
    });

    it('propagates the 403 thrown by the age gate (logged-in minor)', async () => {
      service.getWork.mockResolvedValue({ id: 'w1', slug: 'x', audienceRating: '18+' });
      ageGate.assertMayView18Plus.mockRejectedValue(new ForbiddenException({ error: 'AGE_RESTRICTED' }));
      const req = { accountId: 'acc-minor' } as AuthRequest;

      await expect(controller.getWork('x', req)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('GET /works/:slug/chapters delegates to getChapters with the parsed page', async () => {
    const result = await controller.getChapters('lames-de-brume', '3');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 3);
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  });

  it('GET /works/:slug/chapters clamps a missing/invalid page to 1', async () => {
    await controller.getChapters('lames-de-brume', undefined);
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', 'abc');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);

    await controller.getChapters('lames-de-brume', '0');
    expect(service.getChapters).toHaveBeenCalledWith('lames-de-brume', 1);
  });

  it('GET /works/:slug/chapters throws NotFoundException when the work is missing', async () => {
    service.getChapters.mockResolvedValue(null);
    await expect(controller.getChapters('inconnu', '1')).rejects.toThrow(NotFoundException);
  });

  it('GET /works/:slug/planches delegates to getPlanches', async () => {
    service.getPlanches.mockResolvedValue([{ id: 'p1', image: null, caption: null }]);
    const result = await controller.getPlanches('lames-de-brume');
    expect(service.getPlanches).toHaveBeenCalledWith('lames-de-brume');
    expect(result).toEqual([{ id: 'p1', image: null, caption: null }]);
  });

  it('GET /works/:slug/planches throws NotFoundException when the work is missing', async () => {
    service.getPlanches.mockResolvedValue(null);
    await expect(controller.getPlanches('inconnu')).rejects.toThrow(NotFoundException);
  });
});
