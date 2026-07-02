import { IsArray, IsIn, IsOptional } from 'class-validator';
import { CREATOR_ROLES, LOOKING_FOR_STATUSES, ONBOARDING_GENRE_TAGS } from '@encre-et-plume/shared';

export class OnboardingDto {
  @IsOptional()
  @IsArray()
  @IsIn([...CREATOR_ROLES], { each: true })
  creatorRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsIn([...ONBOARDING_GENRE_TAGS], { each: true })
  tags?: string[];

  @IsOptional()
  @IsIn([...LOOKING_FOR_STATUSES])
  lookingFor?: string;
}
