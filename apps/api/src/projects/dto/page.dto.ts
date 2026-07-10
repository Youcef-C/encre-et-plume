import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  CreatePageRequest,
  PageFileTag,
  PageStage,
  UpdatePageRequest,
  UpdatePageStageRequest,
} from '@encre-et-plume/shared';
import { PAGE_FILE_TAGS, PAGE_STAGES } from '@encre-et-plume/shared';

// Shape validation only — membership, chapter-in-work, and version rules live in PagesService.

export class CreatePageDto implements CreatePageRequest {
  @IsOptional()
  @IsString()
  chapterId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn([...PAGE_STAGES])
  stage?: PageStage;
}

export class UpdatePageDto implements UpdatePageRequest {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  chapterId?: string | null;

  @IsOptional()
  @IsArray()
  @IsIn([...PAGE_FILE_TAGS], { each: true })
  fileTags?: PageFileTag[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedFileIds?: string[];
}

export class UpdatePageStageDto implements UpdatePageStageRequest {
  @IsIn([...PAGE_STAGES])
  stage!: PageStage;
}
