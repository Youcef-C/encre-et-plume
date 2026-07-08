import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { GROUP_NAME_MAX_LENGTH } from '@encre-et-plume/shared';

/**
 * POST /conversations. Loose shape (DM = participantId, group = name + participantIds); the branch +
 * business rules (self-DM, ≥2 participants, name required) are enforced in MessagesService so the
 * union is validated as data, not as a class-validator discriminated type.
 */
export class CreateConversationDto {
  @IsOptional()
  @IsString()
  participantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];
}
