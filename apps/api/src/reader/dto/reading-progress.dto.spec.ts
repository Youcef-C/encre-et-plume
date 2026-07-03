import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReadingProgressDto } from './reading-progress.dto';

describe('ReadingProgressDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(ReadingProgressDto, { workSlug: 'lames-de-brume', chapterNumber: 1, page: 12 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects page < 1', async () => {
    const dto = plainToInstance(ReadingProgressDto, { workSlug: 'lames-de-brume', chapterNumber: 1, page: 0 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects a non-integer chapterNumber', async () => {
    const dto = plainToInstance(ReadingProgressDto, { workSlug: 'lames-de-brume', chapterNumber: 1.5, page: 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'chapterNumber')).toBe(true);
  });

  it('rejects an empty workSlug', async () => {
    const dto = plainToInstance(ReadingProgressDto, { workSlug: '', chapterNumber: 1, page: 1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'workSlug')).toBe(true);
  });
});
