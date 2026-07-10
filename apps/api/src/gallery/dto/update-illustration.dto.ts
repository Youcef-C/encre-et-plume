import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { GalleryCategoryKey, IllustrationVisibility, UpdateIllustrationRequest } from '@encre-et-plume/shared';

// BE-9. Shape validation only — ownership + business rules (title non-empty, known category) are
// enforced in GalleryService (the trust boundary). Every field is optional (partial edit); `@IsOptional`
// skips both undefined and null, so the nullable string fields accept an explicit `null` to clear.
export class UpdateIllustrationDto implements UpdateIllustrationRequest {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: GalleryCategoryKey;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  tools?: string | null;

  @IsOptional()
  @IsString()
  license?: string | null;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: IllustrationVisibility;

  // CS-13 (R2): F-10 Media.id of a freshly-uploaded replacement image. Ownership/kind/status enforced
  // in the service (the trust boundary) — shape only here.
  @IsOptional()
  @IsString()
  image?: string;
}
