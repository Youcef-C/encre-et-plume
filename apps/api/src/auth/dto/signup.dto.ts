import { Equals, IsEmail, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';
import type { SignupRequest } from '@encre-et-plume/shared';
import { IsPlausibleBirthdate } from '../../age-gate/is-plausible-birthdate.validator';

export class SignupDto implements SignupRequest {
  @IsNotEmpty({ message: 'Le nom est requis' })
  displayName!: string;

  @IsEmail({}, { message: 'E-mail invalide' })
  email!: string;

  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password!: string;

  /** User-chosen handle → profileSlug verbatim. Length is enforced by the regex quantifier. */
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,30}$/, {
    message:
      "Nom d'utilisateur invalide : 3 à 30 caractères (lettres minuscules, chiffres, tirets)",
  })
  username?: string;

  /** F-13: must be true; server enforces legal consent at signup. */
  @Equals(true, { message: 'Vous devez accepter les conditions pour créer un compte.' })
  acceptCgu!: boolean;

  /** DR-10: required, 'YYYY-MM-DD'. No minimum signup age (D4) — plausibility only. */
  @IsPlausibleBirthdate({ message: 'Date invalide' })
  birthdate!: string;
}
