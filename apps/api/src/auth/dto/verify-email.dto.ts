import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** BE-3: public resend — mirrors PasswordResetRequestDto */
export class RequestVerificationEmailDto {
  @IsEmail()
  email!: string;
}
