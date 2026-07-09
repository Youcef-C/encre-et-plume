import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CollectionCoverInput,
  RevenueSplitEntry,
  SoutienGoalInput,
  SoutienTier,
  UpdateCollectionRequest,
} from '@encre-et-plume/shared';

// All fields optional; `cover: null` clears the cover. Semantic validation in CollectionsService.
export class UpdateCollectionDto implements UpdateCollectionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsObject()
  cover?: CollectionCoverInput | null;

  @IsOptional()
  @IsString()
  contestId?: string | null;

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
