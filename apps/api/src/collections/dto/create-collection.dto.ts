import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CollectionCoverInput,
  CreateCollectionRequest,
  RevenueSplitEntry,
  SoutienGoalInput,
  SoutienTier,
} from '@encre-et-plume/shared';

// Shape validation only — semantic rules (title required, contest active, revenueSplit Σ=100,
// cover ownership/kind) live in CollectionsService (the trust boundary + where they are tested).
export class CreateCollectionDto implements CreateCollectionRequest {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

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
  cover?: CollectionCoverInput;

  @IsOptional()
  @IsString()
  contestId?: string;

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
