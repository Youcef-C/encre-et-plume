import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MatchesController, parseSuggestionsLimit } from './matches.controller';
import { MatchesService } from './matches.service';
import { SessionGuard } from '../auth/guards/session.guard';

describe('parseSuggestionsLimit', () => {
  it('defaults to 4 when absent or non-numeric', () => {
    expect(parseSuggestionsLimit(undefined)).toBe(4);
    expect(parseSuggestionsLimit('abc')).toBe(4);
    expect(parseSuggestionsLimit('0')).toBe(4);
  });

  it('clamps to the max of 8 (never 400)', () => {
    expect(parseSuggestionsLimit('999')).toBe(8);
  });

  it('parses a valid in-range value', () => {
    expect(parseSuggestionsLimit('3')).toBe(3);
  });
});

describe('MatchesController', () => {
  let controller: MatchesController;
  let service: { getSuggestions: jest.Mock };

  beforeEach(async () => {
    service = { getSuggestions: jest.fn().mockResolvedValue({ items: [], incompleteProfile: false }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<MatchesController>(MatchesController);
  });

  it('is guarded by SessionGuard (401 without a session)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MatchesController) as unknown[] | undefined;
    expect(guards).toEqual([SessionGuard]);
  });

  it('passes the session accountId and clamped limit to the service', async () => {
    await controller.suggestions({ accountId: 'viewer-1', query: { limit: '999' } } as never);
    expect(service.getSuggestions).toHaveBeenCalledWith('viewer-1', 8);
  });

  it('ignores viewerRole entirely (never 400, never read)', async () => {
    await controller.suggestions({ accountId: 'viewer-1', query: { viewerRole: 'dessinateur' } } as never);
    expect(service.getSuggestions).toHaveBeenCalledWith('viewer-1', 4);
  });
});
