import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { ReadingHistoryController } from './reading-history.controller';
import { ReadingHistoryService } from './reading-history.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('ReadingHistoryController', () => {
  let controller: ReadingHistoryController;
  let service: { getHistory: jest.Mock; getForWork: jest.Mock };

  beforeEach(async () => {
    service = {
      getHistory: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      getForWork: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadingHistoryController],
      providers: [
        { provide: ReadingHistoryService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReadingHistoryController>(ReadingHistoryController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReadingHistoryController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  describe('GET /me/reading-history', () => {
    it('delegates to getHistory with req.accountId and the given page', async () => {
      await controller.list({ accountId: 'acc-1' } as never, '2');
      expect(service.getHistory).toHaveBeenCalledWith('acc-1', 2);
    });

    it.each([[undefined], ['abc'], ['0'], ['-1']])('clamps page %p to 1', async (raw) => {
      await controller.list({ accountId: 'acc-1' } as never, raw as never);
      expect(service.getHistory).toHaveBeenCalledWith('acc-1', 1);
    });

    it('never uses a client-supplied accountId', async () => {
      await controller.list({ accountId: 'acc-owner' } as never, '1');
      expect(service.getHistory).toHaveBeenCalledWith('acc-owner', 1);
    });
  });

  describe('GET /me/reading-history/:workSlug', () => {
    it('delegates to getForWork with req.accountId and workSlug', async () => {
      const entry = {
        workSlug: 'lames-de-brume',
        workTitle: 'Lames de Brume',
        chapterNumber: 4,
        chapterTitle: null,
        page: 12,
        totalPages: 28,
        updatedAt: '2026-07-01T10:00:00.000Z',
      };
      service.getForWork.mockResolvedValue(entry);

      const result = await controller.one({ accountId: 'acc-1' } as never, 'lames-de-brume');

      expect(service.getForWork).toHaveBeenCalledWith('acc-1', 'lames-de-brume');
      expect(result).toEqual(entry);
    });

    it('throws NotFoundException("Aucune progression") when there is no history for the work', async () => {
      service.getForWork.mockResolvedValue(null);

      await expect(controller.one({ accountId: 'acc-1' } as never, 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.one({ accountId: 'acc-1' } as never, 'inconnu')).rejects.toMatchObject({
        response: expect.objectContaining({ message: 'Aucune progression' }),
      });
    });
  });
});
