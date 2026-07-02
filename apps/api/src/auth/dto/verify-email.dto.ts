import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
