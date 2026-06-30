import { SEARCH_MIN_QUERY_LENGTH } from '@encre-et-plume/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatorsSearchProvider } from './search.providers';
import { SearchService } from './search.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNT_ROW = {
  id: 'acc-1',
  displayName: 'Yuki Moreau',
  profileSlug: 'yuki-moreau',
  avatar: 'https://example.com/avatar.jpg',
  profile: { specialty: 'encre', city: 'Lyon', tags: ['Seinen', 'Thriller'] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService(findManyReturn: unknown[] = []) {
  const prisma = { account: { findMany: jest.fn().mockResolvedValue(findManyReturn) } };
  const creatorsProvider = new CreatorsSearchProvider(prisma as unknown as PrismaService);
  const service = new SearchService([creatorsProvider]);
  return { service, findMany: prisma.account.findMany };
}

// ─── SearchService ─────────────────────────────────────────────────────────────

describe('SearchService', () => {
  it('returns all-empty groups and does not call Prisma when q is empty', async () => {
    const { service, findMany } = makeService([ACCOUNT_ROW]);
    const result = await service.search('', 'acc-viewer');
    expect(result).toEqual({ works: [], creators: [], illustrations: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it(`returns all-empty groups when q is below SEARCH_MIN_QUERY_LENGTH (${SEARCH_MIN_QUERY_LENGTH})`, async () => {
    const { service, findMany } = makeService([ACCOUNT_ROW]);
    const result = await service.search('a', 'acc-viewer');
    expect(result).toEqual({ works: [], creators: [], illustrations: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('trims whitespace before checking min-length', async () => {
    const { service, findMany } = makeService([ACCOUNT_ROW]);
    const result = await service.search('  a  ', 'acc-viewer');
    expect(result).toEqual({ works: [], creators: [], illustrations: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('passes all four OR conditions to findMany for creator matching', async () => {
    const { service, findMany } = makeService([]);
    await service.search('yuki', 'acc-viewer');
    const whereArg = findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toEqual(
      expect.arrayContaining([
        { displayName: { contains: 'yuki', mode: 'insensitive' } },
        { profile: { specialty: { contains: 'yuki', mode: 'insensitive' } } },
        { profile: { city: { contains: 'yuki', mode: 'insensitive' } } },
        { profile: { tags: { has: 'yuki' } } },
      ]),
    );
  });

  it('maps account rows to SearchResultItem correctly', async () => {
    const { service } = makeService([ACCOUNT_ROW]);
    const result = await service.search('yuki', 'acc-viewer');
    expect(result.creators).toEqual([
      {
        id: 'acc-1',
        type: 'creators',
        title: 'Yuki Moreau',
        thumbnail: 'https://example.com/avatar.jpg',
        route: '/yuki-moreau',
      },
    ]);
  });

  it('maps null avatar to null thumbnail', async () => {
    const { service } = makeService([{ ...ACCOUNT_ROW, avatar: null }]);
    const result = await service.search('yuki', 'acc-viewer');
    expect(result.creators[0].thumbnail).toBeNull();
  });

  it('caps results at limit=8 via take argument', async () => {
    const { service, findMany } = makeService([]);
    await service.search('test', 'acc-viewer');
    expect(findMany.mock.calls[0][0].take).toBe(8);
  });

  it('works and illustrations are always empty arrays (no providers)', async () => {
    const { service } = makeService([ACCOUNT_ROW]);
    const result = await service.search('yuki', 'acc-viewer');
    expect(result.works).toEqual([]);
    expect(result.illustrations).toEqual([]);
  });

  it('scope=creators runs only creators provider and returns creators', async () => {
    const { service } = makeService([ACCOUNT_ROW]);
    const result = await service.search('yuki', 'acc-viewer', 'creators');
    expect(result.creators).toHaveLength(1);
    expect(result.works).toEqual([]);
    expect(result.illustrations).toEqual([]);
  });

  it('scope=works returns all-empty (no works provider registered)', async () => {
    const { service, findMany } = makeService([ACCOUNT_ROW]);
    const result = await service.search('yuki', 'acc-viewer', 'works');
    expect(result).toEqual({ works: [], creators: [], illustrations: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scope=illustrations returns all-empty (no illustrations provider)', async () => {
    const { service, findMany } = makeService([ACCOUNT_ROW]);
    const result = await service.search('yuki', 'acc-viewer', 'illustrations');
    expect(result).toEqual({ works: [], creators: [], illustrations: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('passes ctx.accountId to the provider (reserved for future draft-visibility)', async () => {
    const { service, findMany } = makeService([]);
    await service.search('test', 'viewer-id');
    // accountId is in ctx but not used in the WHERE today; just verify the call was made
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

// ─── SearchQueryDto validation ─────────────────────────────────────────────────

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SearchQueryDto } from './dto/search-query.dto';

describe('SearchQueryDto validation', () => {
  it('accepts missing q and scope (both optional)', async () => {
    const dto = plainToInstance(SearchQueryDto, {}) as SearchQueryDto;
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts valid scope values', async () => {
    for (const scope of ['works', 'creators', 'illustrations']) {
      const dto = plainToInstance(SearchQueryDto, { q: 'test', scope }) as SearchQueryDto;
      expect(await validate(dto)).toHaveLength(0);
    }
  });

  it('rejects invalid scope value → validation error', async () => {
    const dto = plainToInstance(SearchQueryDto, { scope: 'invalid-scope' }) as SearchQueryDto;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('scope');
  });

  it('accepts q as a string', async () => {
    const dto = plainToInstance(SearchQueryDto, { q: 'manga', scope: 'creators' }) as SearchQueryDto;
    expect(await validate(dto)).toHaveLength(0);
  });
});
