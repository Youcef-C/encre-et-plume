import type { UpdateBirthdateRequest } from '@encre-et-plume/shared';
import { IsPlausibleBirthdate } from '../../age-gate/is-plausible-birthdate.validator';

/** DR-10 BE-9: PATCH /accounts/me/birthdate body — existing-account prompt when isAdult is null. */
export class UpdateBirthdateDto implements UpdateBirthdateRequest {
  @IsPlausibleBirthdate({ message: 'Date invalide' })
  birthdate!: string;
}
