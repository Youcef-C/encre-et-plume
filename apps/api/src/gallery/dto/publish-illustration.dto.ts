import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GALLERY_CATEGORY_KEYS } from '@encre-et-plume/shared';
import type { GalleryCategoryKey, PublishIllustrationRequest, SoutienGoalInput, SoutienTier } from '@encre-et-plume/shared';

// DR-12 (BE-4). Shape validation only — creator role + collection ownership + media kind/status are
// enforced in GalleryService (the trust boundary + where they are tested).
export class PublishIllustrationDto implements PublishIllustrationRequest {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsIn([...GALLERY_CATEGORY_KEYS])
  category!: GalleryCategoryKey;

  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  collectionIds?: string[];

  // CS-1 induced additions (contest link + raw Soutien). Semantic rules (open contest) in GalleryService.
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
}
