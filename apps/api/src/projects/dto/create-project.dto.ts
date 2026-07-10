import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type {
  CatalogAudienceRating,
  CreateProjectRequest,
  ProjectFormat,
  ProjectType,
  ProjectVisibility,
  RevenueSplitEntry,
  SoutienGoalInput,
  SoutienTier,
} from '@encre-et-plume/shared';
import {
  CATALOG_AUDIENCE_RATINGS,
  PROJECT_FORMATS,
  PROJECT_TYPES,
  PROJECT_VISIBILITIES,
} from '@encre-et-plume/shared';

// "Je recherche" counters — 0..5 per role. Nested class so the DTO-level test validates the range;
// the service also clamps (trust boundary), since the global ValidationPipe runs without transform.
class ProjectSeekingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  scenariste?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  dessinateur?: number;
}

// Shape validation only — semantic rules (open contest, revenueSplit Σ=100 + membership, F-20 genre
// ids, cover ownership/kind, slug uniqueness) live in ProjectsService (the trust boundary + tests).
export class CreateProjectDto implements CreateProjectRequest {
  @IsIn([...PROJECT_TYPES])
  type!: ProjectType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Un titre est requis' })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsObject()
  cover?: { mediaId: string };

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  synopsis?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsIn([...PROJECT_FORMATS])
  format?: ProjectFormat;

  @IsOptional()
  @IsString()
  contestId?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  themes?: string[];

  @IsOptional()
  @IsIn([...CATALOG_AUDIENCE_RATINGS])
  audienceRating?: CatalogAudienceRating;

  @IsOptional()
  @IsIn([...PROJECT_VISIBILITIES])
  visibility?: ProjectVisibility;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  invites?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectSeekingDto)
  seeking?: ProjectSeekingDto;

  @IsOptional()
  @IsArray()
  tiers?: SoutienTier[];

  @IsOptional()
  @IsBoolean()
  allowDonations?: boolean;

  @IsOptional()
  @IsArray()
  goals?: SoutienGoalInput[];

  @IsOptional()
  @IsArray()
  revenueSplit?: RevenueSplitEntry[];
}
