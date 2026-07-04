import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SearchQueryDto } from './search-query.dto';

/** L: cap `q` — an unbounded search string is a cheap DoS vector against downstream ILIKE queries. */
describe('SearchQueryDto — q length cap (L)', () => {
  it('accepts q at exactly 100 characters', async () => {
    const dto = plainToInstance(SearchQueryDto, { q: 'a'.repeat(100) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects q at 101 characters', async () => {
    const dto = plainToInstance(SearchQueryDto, { q: 'a'.repeat(101) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('q');
  });
});
