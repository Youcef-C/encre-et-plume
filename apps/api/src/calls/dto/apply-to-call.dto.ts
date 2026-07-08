import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { APPLICATION_MAX_SAMPLES, APPLICATION_MESSAGE_MAX, CREATOR_ROLES } from '@encre-et-plume/shared';
import type { CreatorRole } from '@encre-et-plume/shared';

/**
 * MC-4X: one sample ref (XOR mediaId/portfolioItemId). The XOR and the ownership/kind/ready
 * checks live in the service (they depend on state the DTO can't see); the DTO only bounds shapes.
 */
export class ApplicationSampleRefDto {
  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsString()
  portfolioItemId?: string;
}

/**
 * POST /calls/:id/applications body. MC-4X: 1..APPLICATION_MAX_SAMPLES mixed samples (uploaded
 * image, uploaded PDF, or a portfolio piece). `appliedAs` is server-derived (= the call's
 * seekingRole) and no longer accepted from the client.
 */
export class ApplyToCallDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez un échantillon de votre travail.' })
  @ArrayMaxSize(APPLICATION_MAX_SAMPLES, { message: 'Trois échantillons maximum.' })
  @ValidateNested({ each: true })
  @Type(() => ApplicationSampleRefDto)
  samples!: ApplicationSampleRefDto[];

  @IsOptional()
  @IsString()
  @MaxLength(APPLICATION_MESSAGE_MAX, { message: 'Le message est trop long (1000 caractères max).' })
  message?: string;

  // MC-4X req6: only used when the call seeks multiple roles the applicant both holds (the FE chooser).
  // Shape-checked here; the "∈ (seekingRoles ∩ your roles)" check lives in the service.
  @IsOptional()
  @IsIn(CREATOR_ROLES, { message: 'Rôle invalide.' })
  appliedAs?: CreatorRole;
}
