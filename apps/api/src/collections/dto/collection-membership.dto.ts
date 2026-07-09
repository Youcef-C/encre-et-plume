import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import type { AddCollectionIllustrationRequest, ReorderCollectionRequest } from '@encre-et-plume/shared';

export class AddCollectionIllustrationDto implements AddCollectionIllustrationRequest {
  @IsString()
  illustrationId!: string;
}

export class ReorderCollectionDto implements ReorderCollectionRequest {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  illustrationIds!: string[];
}
