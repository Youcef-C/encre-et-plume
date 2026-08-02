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
 * CS-8 POST /projects/:slug/messages body. SHAPE ONLY — "text or ≥1 attachment required" and the
 * attachment ownership/readiness checks stay MessagesService's rule (one definition, already tested).
 * The story names the field `text`; the stored column is MC-9's `body`, mapped in ProjectChatService.
 */
export class SendProjectMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MESSAGE_MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachments?: AttachmentRefDto[];
}
