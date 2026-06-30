import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import type { SearchResponse } from '@encre-et-plume/shared';

const EMPTY_RESPONSE: SearchResponse = { works: [], creators: [], illustrations: [] };

const CREATORS_RESPONSE: SearchResponse = {
  works: [],
  creators: [{ id: 'acc-1', type: 'creators', title: 'Yuki', thumbnail: null, route: '/yuki' }],
  illustrations: [],
};

describe('SearchController', () => {
  let controller: SearchController;
  let service: { search: jest.Mock };

  beforeEach(async () => {
    service = { search: jest.fn().mockResolvedValue(EMPTY_RESPONSE) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: service },
        { provide: SessionGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('GET /search delegates to service with accountId, q, and scope', async () => {
    service.search.mockResolvedValue(CREATORS_RESPONSE);
    const req = { accountId: 'acc-viewer' } as AuthRequest;

    const result = await controller.search(req, { q: 'yuki', scope: 'creators' });

    expect(service.search).toHaveBeenCalledWith('yuki', 'acc-viewer', 'creators');
    expect(result).toEqual(CREATORS_RESPONSE);
  });

  it('passes empty string when q is undefined', async () => {
    const req = { accountId: 'acc-viewer' } as AuthRequest;

    await controller.search(req, {});

    expect(service.search).toHaveBeenCalledWith('', 'acc-viewer', undefined);
  });

  it('passes undefined scope when not provided', async () => {
    const req = { accountId: 'acc-viewer' } as AuthRequest;

    await controller.search(req, { q: 'test' });

    expect(service.search).toHaveBeenCalledWith('test', 'acc-viewer', undefined);
  });

  it('returns the SearchResponse from the service', async () => {
    service.search.mockResolvedValue(CREATORS_RESPONSE);
    const req = { accountId: 'acc-viewer' } as AuthRequest;

    const result = await controller.search(req, { q: 'yuki' });

    expect(result).toEqual(CREATORS_RESPONSE);
  });
});
