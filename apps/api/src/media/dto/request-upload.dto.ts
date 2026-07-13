import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  MEDIA_KINDS,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
  ASSET_ALLOWED_CONTENT_TYPES,
  DRAWING_SOURCE_CONTENT_TYPES,
  MAX_ASSET_BYTES,
} from '@encre-et-plume/shared';
import type { MediaKind, MediaVisibility } from '@encre-et-plume/shared';

export class RequestUploadDto {
  @IsString()
  @IsIn(MEDIA_KINDS)
  kind!: MediaKind;

  // Union of the image + document + asset + drawing-source allowlists; media.service enforces the
  // strict per-kind subset (e.g. octet-stream is asset-only, rejected for every other kind).
  @IsString()
  @IsIn([
    ...UPLOAD_ALLOWED_CONTENT_TYPES,
    ...DOCUMENT_ALLOWED_CONTENT_TYPES,
    ...ASSET_ALLOWED_CONTENT_TYPES,
    ...DRAWING_SOURCE_CONTENT_TYPES,
  ])
  contentType!: string;

  // Upper bound is the largest kind cap (MAX_ASSET_BYTES, ~200 MB); media.service enforces the real
  // per-kind cap (10 MB for non-asset kinds).
  @IsNumber()
  @Min(1)
  @Max(MAX_ASSET_BYTES)
  size!: number;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: MediaVisibility;
}
