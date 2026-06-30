import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SEEKING_TARGET_ROLES } from '@encre-et-plume/shared';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => SeekingDto)
  seeking?: SeekingDto;

  @IsOptional()
  @IsString()
  bio?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  specialty?: string | null;
}
