import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { REACTION_TARGET_TYPES, type ReactionTargetType } from '@encre-et-plume/shared';

/** Body for all 4 toggle routes (POST/DELETE /reactions/{like,save}) — mirrors ReadingProgressDto's style. */
export class ReactionToggleDto {
  @IsIn(REACTION_TARGET_TYPES)
  targetType!: ReactionTargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;
}
