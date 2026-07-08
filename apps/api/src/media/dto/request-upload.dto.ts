import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  MEDIA_KINDS,
  UPLOAD_ALLOWED_CONTENT_TYPES,
  DOCUMENT_ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from '@encre-et-plume/shared';
import type { MediaKind, MediaVisibility } from '@encre-et-plume/shared';

export class RequestUploadDto {
  @IsString()
  @IsIn(MEDIA_KINDS)
  kind!: MediaKind;

  // Union of the image + document allowlists; media.service enforces the strict per-kind subset.
  @IsString()
  @IsIn([...UPLOAD_ALLOWED_CONTENT_TYPES, ...DOCUMENT_ALLOWED_CONTENT_TYPES])
  contentType!: string;

  @IsNumber()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size!: number;

  @IsOptional()
  @IsIn(['public', 'private'])
  visibility?: MediaVisibility;
}
