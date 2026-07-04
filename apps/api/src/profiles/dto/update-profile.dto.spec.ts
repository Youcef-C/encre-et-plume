import 'reflect-metadata'; // UpdateProfileDto uses @Type/@ValidateNested (SeekingDto) — needs the polyfill
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto';

/** L: cap free-text fields — an unbounded bio/city/specialty is a cheap DoS/storage vector. */
describe('UpdateProfileDto — free-text length caps (L)', () => {
  it.each([
    ['bio', 2000],
    ['city', 120],
    ['specialty', 160],
  ])('accepts %s at exactly the max length', async (field, max) => {
    const dto = plainToInstance(UpdateProfileDto, { [field]: 'a'.repeat(max) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['bio', 2000],
    ['city', 120],
    ['specialty', 160],
  ])('rejects %s one character over the max length', async (field, max) => {
    const dto = plainToInstance(UpdateProfileDto, { [field]: 'a'.repeat(max + 1) });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe(field);
  });
});
