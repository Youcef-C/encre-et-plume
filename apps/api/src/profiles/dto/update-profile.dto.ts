import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SEEKING_TARGET_ROLES, PARTNER_REGIONS, PARTNER_AVAILABILITY_KEYS, COUNTRY_CODES, CREATOR_ROLES } from '@encre-et-plume/shared';
import type { PartnerRegion, PartnerAvailability, CreatorRole } from '@encre-et-plume/shared';

class SeekingDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // ponytail: @IsOptional skips @IsIn for both null and undefined; invalid strings fail correctly
  @IsOptional()
  @IsIn([...SEEKING_TARGET_ROLES])
  targetRole?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsString()
  projectLength?: string | null;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // MC-1 §9: user-defined creator type(s). Empty array allowed (mirrors F-17 onboarding).
  @IsOptional()
  @IsArray()
  @IsIn([...CREATOR_ROLES], { each: true })
  creatorRoles?: CreatorRole[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SeekingDto)
  seeking?: SeekingDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000) // L: cap free-text length
  bio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120) // L: cap free-text length
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160) // L: cap free-text length
  specialty?: string | null;

  // ponytail: @IsOptional skips @IsIn for both null and undefined; unknown codes still fail correctly
  @IsOptional()
  @IsIn(COUNTRY_CODES) // MC-1: ISO alpha-2 country (location unit)
  country?: string | null;

  @IsOptional()
  @IsIn([...PARTNER_REGIONS]) // MC-1: FR-only région sub-level ('Hors France' retired)
  region?: PartnerRegion | null;

  @IsOptional()
  @IsIn([...PARTNER_AVAILABILITY_KEYS]) // MC-1: directory availability column
  availability?: PartnerAvailability;
}
