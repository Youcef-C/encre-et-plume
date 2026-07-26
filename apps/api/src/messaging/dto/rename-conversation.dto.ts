import { IsString, MaxLength } from 'class-validator';
import { GROUP_NAME_MAX_LENGTH } from '@encre-et-plume/shared';

/**
 * PATCH /conversations/:id body. An empty string is valid and CLEARS the name (the title falls back
 * to the participants). Creator-only authz + the group/standalone gates live in MessagesService.
 */
export class RenameConversationDto {
  @IsString()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  name!: string;
}
