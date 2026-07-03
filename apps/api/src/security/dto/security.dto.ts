/** F-18: DTOs for SecurityController endpoints. */
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

export class TwoFactorConfirmDto {
  @IsString()
  @MinLength(6)
  @MaxLength(8)
  code!: string;
}

export class TwoFactorDisableDto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @MinLength(1)
  code!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class TwoFactorVerifyDto {
  @IsString()
  @MinLength(1)
  challengeToken!: string;

  @IsString()
  @MinLength(1)
  code!: string;
}
