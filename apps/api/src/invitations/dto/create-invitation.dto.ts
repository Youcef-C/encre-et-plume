import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { INVITATION_MESSAGE_MAX } from '@encre-et-plume/shared';

export class CreateInvitationDto {
  @IsString()
  @IsNotEmpty()
  toUser!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(INVITATION_MESSAGE_MAX, { message: 'Le message est trop long (1000 caractères max).' })
  message?: string;
}
