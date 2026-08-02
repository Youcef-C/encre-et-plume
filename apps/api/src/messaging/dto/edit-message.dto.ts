import { IsString, MaxLength } from 'class-validator';
import { MESSAGE_MAX_LENGTH } from '@encre-et-plume/shared';

/**
 * MC-15 PATCH /messages/:id body. Boundary validation only — "non-empty body OR an attachment",
 * author-only and the salon refusal all live in MessagesService (unit-tested + defense in depth
 * against a caller that skips the pipe), matching the send DTOs.
 */
export class EditMessageDto {
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  text!: string;
}
