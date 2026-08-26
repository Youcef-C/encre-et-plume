import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

describe('ReaderController', () => {
  let controller: ReaderController;
  let service: { getPages: jest.Mock };
  let blocks: { hiddenContent: jest.Mock };

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

    blocks = { hiddenContent: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReaderController],
      providers: [
        { provide: ReaderService, useValue: service },
        { provide: BlocksService, useValue: blocks },
        { provide: OptionalSessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(OptionalSessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReaderController>(ReaderController);
  });

  it('is public — no class-level guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReaderController) as unknown[] | undefined;
    expect(guards).toBeUndefined();
  });

  it('applies OptionalSessionGuard at the method level (DR-10 BE-6)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReaderController.prototype.getPages) as unknown[] | undefined;
    expect(guards).toContain(OptionalSessionGuard);
  });

  it('GET /works/:slug/chapters/:n/pages delegates with a parsed chapter number and req.accountId', async () => {
    const req = { accountId: 'acc-1' } as AuthRequest;
    const result = await controller.getPages('lames-de-brume', '4', req);
    // F-23: the client hint (ip + user-agent) rides along for the visitor-id hash; neither is stored.
    expect(service.getPages).toHaveBeenCalledWith('lames-de-brume', 4, 'acc-1', expect.any(Object));
    expect(result).toEqual({
      workSlug: 'lames-de-brume',
      chapterNumber: 1,
      readMode: 'pages',
      totalPages: 0,
      pages: [],
      prose: [],
    });
  });

  it('passes undefined accountId for a visitor', async () => {
    const req = {} as AuthRequest;
    await controller.getPages('lames-de-brume', '1', req);
    expect(service.getPages).toHaveBeenCalledWith('lames-de-brume', 1, undefined, expect.any(Object));
  });

  it('propagates errors thrown by the service (e.g. 404 unknown chapter)', async () => {
    service.getPages.mockRejectedValue(new NotFoundException('Chapitre introuvable'));
    const req = {} as AuthRequest;
    await expect(controller.getPages('lames-de-brume', '99', req)).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── MC-10 round 2 (B11): reader mutual hiding ──
  it('404s Chapitre introuvable when the work slug is in the blocked-pair set', async () => {
    blocks.hiddenContent.mockResolvedValue({
      accountIds: new Set<string>(),
      workIds: new Set<string>(),
      workSlugs: new Set(['lames-de-brume']),
      illustrationIds: new Set<string>(),
    });
    await expect(controller.getPages('lames-de-brume', '1', { accountId: 'acc-1' } as AuthRequest)).rejects.toThrow(
      'Chapitre introuvable',
    );
    expect(service.getPages).not.toHaveBeenCalled();
  });

  it('does not consult hiddenContent for an anonymous viewer', async () => {
    await controller.getPages('lames-de-brume', '1', {} as AuthRequest);
    expect(blocks.hiddenContent).not.toHaveBeenCalled();
  });
});
