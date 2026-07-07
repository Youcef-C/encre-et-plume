import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { APPLICATION_MESSAGE_MAX, CREATOR_ROLES } from '@encre-et-plume/shared';
import type { CreatorRole } from '@encre-et-plume/shared';

/**
 * POST /calls/:id/applications body. Exactly one of the two sample fields is required — that
 * XOR (and the "invalid sample" checks) live in the service, not here, because they depend on
 * ownership/state the DTO can't see. The DTO only bounds the string shapes at the trust boundary.
 */
export class ApplyToCallDto {
  @IsOptional()
  @IsString()
  sampleMediaId?: string;

  @IsOptional()
  @IsString()
  samplePortfolioItemId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(APPLICATION_MESSAGE_MAX, { message: 'Le message est trop long (1000 caractères max).' })
  message?: string;

  // MC-6: which creator role the applicant applies as. Shape-checked here (must be a CreatorRole);
  // the "is one of YOUR roles" check lives in the service (needs the applicant's profile).
  @IsOptional()
  @IsIn(CREATOR_ROLES, { message: 'Rôle invalide.' })
  appliedAs?: CreatorRole;
}
