import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_MAX_ATTACHMENTS, MESSAGE_MAX_LENGTH } from '@encre-et-plume/shared';

class AttachmentRefDto {
  @IsString()
  @IsNotEmpty()
  mediaId!: string;
}

/**
 * POST /conversations/:id/messages body. Boundary validation only — the "body non-empty OR ≥1
 * attachment" rule and attachment ownership/readiness checks live in MessagesService (unit-tested +
 * defense-in-depth against a caller that skips the pipe).
 */
export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MESSAGE_MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}
