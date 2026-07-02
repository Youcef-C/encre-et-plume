import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { RequestPasswordResetRequest, ConfirmPasswordResetRequest } from '@encre-et-plume/shared';

export class PasswordResetRequestDto implements RequestPasswordResetRequest {
  @IsEmail({}, { message: 'E-mail invalide' })
  email!: string;
}

export class PasswordResetConfirmDto implements ConfirmPasswordResetRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;

  // Same strength rule as signup (SignupDto)
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  newPassword!: string;
}
