import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CreateChecklistItemRequest,
  CreateLabelRequest,
  CreatePageCommentRequest,
  UpdateChecklistItemRequest,
  UpdateLabelRequest,
  UpdatePageCommentRequest,
} from '@encre-et-plume/shared';

// Shape validation only — palette/membership/author rules live in CardCollabService.

export class CreateLabelDto implements CreateLabelRequest {
  @IsString()
  @MaxLength(30)
  name!: string;

  @IsString()
  color!: string; // validated ∈ LABEL_COLORS in the service
}

export class UpdateLabelDto implements UpdateLabelRequest {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateChecklistItemDto implements CreateChecklistItemRequest {
  @IsString()
  @MaxLength(200)
  text!: string;
}

export class UpdateChecklistItemDto implements UpdateChecklistItemRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreatePageCommentDto implements CreatePageCommentRequest {
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class UpdatePageCommentDto implements UpdatePageCommentRequest {
  @IsString()
  @MaxLength(2000)
  body!: string;
}
