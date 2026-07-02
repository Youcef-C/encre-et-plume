import { IsEmail, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';
import type { SignupRequest } from '@encre-et-plume/shared';

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
}
