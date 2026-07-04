import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateBirthdateDto } from './update-birthdate.dto';

async function errorsFor(birthdate: unknown) {
  const dto = plainToInstance(UpdateBirthdateDto, { birthdate });
  return validate(dto);
}

describe('UpdateBirthdateDto (DR-10 BE-9)', () => {
  it('accepts a plausible birthdate', async () => {
    expect(await errorsFor('1990-01-01')).toHaveLength(0);
  });

  it('rejects a missing birthdate with "Date invalide"', async () => {
    const errors = await errorsFor(undefined);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('birthdate');
    expect(Object.values(errors[0].constraints ?? {}).join(' ')).toMatch(/date invalide/i);
  });

  it('rejects a future date with "Date invalide"', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(await errorsFor(future.toISOString().slice(0, 10))).toHaveLength(1);
  });

  it('rejects a date more than 120 years ago', async () => {
    expect(await errorsFor('1900-01-01')).toHaveLength(1);
  });
});
