import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import type { UpdateProjectInfoRequest } from '@encre-et-plume/shared';

// Shape validation only — semantic rules (non-empty title, hashtag normalization, cover
// ownership/kind/ready) live in ProjectsService.updateInfo (the trust boundary + tests).
// All fields optional: debounced field-level auto-save sends deltas.
export class UpdateProjectInfoDto implements UpdateProjectInfoRequest {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  synopsis?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsBoolean()
  collabOpen?: boolean;

  // `null` clears the cover; `{ mediaId }` sets it. ValidateIf skips the object check for null;
  // the mediaId → ownership/kind/ready check happens in the service (F-10).
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsObject()
  cover?: { mediaId: string } | null;
}
