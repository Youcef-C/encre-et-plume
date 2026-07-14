import { IsIn, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import type {
  AddAssetVersionRequest,
  AssetType,
  CreateAssetFromUrlRequest,
  CreateAssetRequest,
  LinkAssetRequest,
  SetActiveVersionRequest,
} from '@encre-et-plume/shared';
import { ASSET_TYPES } from '@encre-et-plume/shared';

// Shape validation only — membership, media ownership, type derivation and versioning live in AssetsService.

export class CreateAssetDto implements CreateAssetRequest {
  @IsString()
  mediaId!: string;

  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsIn(ASSET_TYPES)
  type?: AssetType;
}

export class CreateAssetFromUrlDto implements CreateAssetFromUrlRequest {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  @IsOptional()
  @IsIn(ASSET_TYPES)
  type?: AssetType;
}

export class AddAssetVersionDto implements AddAssetVersionRequest {
  @IsString()
  mediaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class SetActiveVersionDto implements SetActiveVersionRequest {
  @IsInt()
  @Min(1)
  version!: number;
}

export class LinkAssetDto implements LinkAssetRequest {
  @IsString()
  pageId!: string;

  @IsOptional()
  @IsIn(ASSET_TYPES)
  type?: AssetType;
}
