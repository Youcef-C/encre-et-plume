import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';

const REQ = { accountId: 'acc1' } as AuthRequest;

describe('CollectionsController', () => {
  let controller: CollectionsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'w1' }),
      assertCreator: jest.fn().mockResolvedValue(undefined),
      getMine: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({ id: 'w1' }),
      update: jest.fn().mockResolvedValue({ id: 'w1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      addIllustration: jest.fn().mockResolvedValue({ id: 'w1' }),
      removeIllustration: jest.fn().mockResolvedValue(undefined),
      reorder: jest.fn().mockResolvedValue({ id: 'w1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollectionsController],
      providers: [{ provide: CollectionsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CollectionsController);
  });

  it('POST /collections is session-guarded and delegates', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CollectionsController.prototype.create)).toContain(SessionGuard);
    await controller.create(REQ, { title: 'X' });
    expect(service.create).toHaveBeenCalledWith('acc1', { title: 'X' });
  });

  it('GET /collections/mine asserts the creator role then lists', async () => {
    await controller.getMine(REQ);
    expect(service.assertCreator).toHaveBeenCalledWith('acc1');
    expect(service.getMine).toHaveBeenCalledWith('acc1');
  });

  it('GET /collections/:id is public (OptionalSessionGuard) and 404s on null', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CollectionsController.prototype.getById)).toContain(OptionalSessionGuard);
    service.getById.mockResolvedValue(null);
    await expect(controller.getById('missing', {} as AuthRequest)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('membership + reorder routes are session-guarded and delegate', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CollectionsController.prototype.addIllustration)).toContain(SessionGuard);
    await controller.addIllustration('w1', REQ, { illustrationId: 'i1' });
    expect(service.addIllustration).toHaveBeenCalledWith('acc1', 'w1', 'i1');

    await controller.removeIllustration('w1', 'i1', REQ);
    expect(service.removeIllustration).toHaveBeenCalledWith('acc1', 'w1', 'i1');

    await controller.reorder('w1', REQ, { illustrationIds: ['i1', 'i2'] });
    expect(service.reorder).toHaveBeenCalledWith('acc1', 'w1', ['i1', 'i2']);
  });
});
