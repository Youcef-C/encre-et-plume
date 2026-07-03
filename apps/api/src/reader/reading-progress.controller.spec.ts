import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { ReadingProgressDto } from './dto/reading-progress.dto';

describe('ReadingProgressController', () => {
  let controller: ReadingProgressController;
  let service: { save: jest.Mock };

  beforeEach(async () => {
    service = { save: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadingProgressController],
      providers: [
        { provide: ReadingProgressService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReadingProgressController>(ReadingProgressController);
  });

  it('is guarded by SessionGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReadingProgressController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('PUT /me/reading-progress delegates to save with req.accountId + body', async () => {
    const dto: ReadingProgressDto = { workSlug: 'lames-de-brume', chapterNumber: 1, page: 12 };
    await controller.save({ accountId: 'acc-1' } as never, dto);
    expect(service.save).toHaveBeenCalledWith('acc-1', dto);
  });
});
