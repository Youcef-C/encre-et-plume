import { IsIn } from 'class-validator';
import type { ConversationRequestAction } from '@encre-et-plume/shared';

// PATCH /conversations/:id/request — recipient accepts or declines a DM request (BE-4).
export class RespondRequestDto {
  @IsIn(['accept', 'decline'])
  action!: ConversationRequestAction;
}
