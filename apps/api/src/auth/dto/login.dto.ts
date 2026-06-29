import { IsBoolean, IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import type { LoginRequest } from '@encre-et-plume/shared';

export class LoginDto implements LoginRequest {
  @IsEmail({}, { message: 'E-mail invalide' })
  email!: string;

  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
