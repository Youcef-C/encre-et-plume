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

/** MC-1 (owner addendum §5): country (ISO alpha-2) is the location unit; the 18 French régions are
 *  the FR-only sub-level; 'Hors France' is retired. */
describe('UpdateProfileDto — location vocabulary (MC-1 addendum)', () => {
  it('accepts a valid French région', async () => {
    const dto = plainToInstance(UpdateProfileDto, { region: 'Auvergne-Rhône-Alpes' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects the retired "Hors France" bucket', async () => {
    const dto = plainToInstance(UpdateProfileDto, { region: 'Hors France' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('region');
  });

  it('rejects the retired continent value "Europe"', async () => {
    const dto = plainToInstance(UpdateProfileDto, { region: 'Europe' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('region');
  });

  it('accepts a valid ISO alpha-2 country code', async () => {
    const dto = plainToInstance(UpdateProfileDto, { country: 'JP' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unknown country code', async () => {
    const dto = plainToInstance(UpdateProfileDto, { country: 'XX' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('country');
  });

  it('accepts null country (clearing the location)', async () => {
    const dto = plainToInstance(UpdateProfileDto, { country: null });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/** MC-1 §9: the user defines their creator type(s) on the profile. Validated against F-2 CREATOR_ROLES,
 *  array, both selectable, empty allowed (consistent with F-17 onboarding). */
describe('UpdateProfileDto — creatorRoles (MC-1 §9)', () => {
  it('accepts both creator roles', async () => {
    const dto = plainToInstance(UpdateProfileDto, { creatorRoles: ['scenariste', 'dessinateur'] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an empty array (consistent with onboarding)', async () => {
    const dto = plainToInstance(UpdateProfileDto, { creatorRoles: [] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an unknown creator role', async () => {
    const dto = plainToInstance(UpdateProfileDto, { creatorRoles: ['scenariste', 'editor'] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('creatorRoles');
  });
});
