import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import type { SignupRequest } from '@encre-et-plume/shared';

export class SignupDto implements SignupRequest {
  @IsNotEmpty({ message: 'Le nom est requis' })
  displayName!: string;

  @IsEmail({}, { message: 'E-mail invalide' })
  email!: string;

  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password!: string;
}
