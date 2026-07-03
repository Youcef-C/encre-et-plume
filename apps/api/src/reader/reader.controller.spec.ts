import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';

describe('ReaderController', () => {
  let controller: ReaderController;
  let service: { getPages: jest.Mock };

  beforeEach(async () => {
    service = {
      getPages: jest.fn().mockResolvedValue({
        workSlug: 'lames-de-brume',
        chapterNumber: 1,
        readMode: 'pages',
        totalPages: 0,
        pages: [],
        prose: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReaderController],
      providers: [{ provide: ReaderService, useValue: service }],
    }).compile();

    controller = module.get<ReaderController>(ReaderController);
  });

  it('is public — no guards on the controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReaderController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('GET /works/:slug/chapters/:n/pages delegates with a parsed chapter number', async () => {
    const result = await controller.getPages('lames-de-brume', '4');
    expect(service.getPages).toHaveBeenCalledWith('lames-de-brume', 4);
    expect(result).toEqual({
      workSlug: 'lames-de-brume',
      chapterNumber: 1,
      readMode: 'pages',
      totalPages: 0,
      pages: [],
      prose: [],
    });
  });

  it('propagates errors thrown by the service (e.g. 404 unknown chapter)', async () => {
    service.getPages.mockRejectedValue(new NotFoundException('Chapitre introuvable'));
    await expect(controller.getPages('lames-de-brume', '99')).rejects.toBeInstanceOf(NotFoundException);
  });
});
