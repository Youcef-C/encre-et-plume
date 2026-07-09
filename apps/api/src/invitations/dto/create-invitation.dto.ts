import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { INVITATION_MAX_RECIPIENTS, INVITATION_MESSAGE_MAX } from '@encre-et-plume/shared';

export class CreateInvitationDto {
  @IsOptional()
  @IsIn(['direct']) // 'join' → 400 (Mode B deferred to CS-10)
  kind?: 'direct';

  @IsOptional()
  @IsString()
  @IsNotEmpty() // legacy single-recipient sugar — kept, it's free
  toUser?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(INVITATION_MAX_RECIPIENTS, { message: 'Trop de destinataires (20 max).' })
  @IsString({ each: true })
  toUsers?: string[];

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(INVITATION_MESSAGE_MAX, { message: 'Le message est trop long (1000 caractères max).' })
  message?: string;
}
