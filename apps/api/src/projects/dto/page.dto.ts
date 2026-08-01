import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import type {
  CreatePageRequest,
  PageFileTag,
  PageStage,
  UpdatePageRequest,
  UpdatePageStageRequest,
} from '@encre-et-plume/shared';
import { PAGE_FILE_TAGS, PAGE_STAGES } from '@encre-et-plume/shared';

// Shape validation only — membership, chapter-in-work, and version rules live in PagesService.
// The two `chapterId` fields stay laxer than their shared request types (`string | null | undefined`
// vs `string`) ON PURPOSE: the wire must be able to CARRY a missing/null chapter so the service can
// answer with the R2-1/R2-5c 400 instead of class-validator swallowing it as a shape error.

export class CreatePageDto implements Omit<CreatePageRequest, 'chapterId'> {
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

export class UpdatePageDto implements Omit<UpdatePageRequest, 'chapterId'> {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  chapterId?: string | null;

  // R8-1 — PLACEMENT: a 1-based slot. The service clamps out-of-range values (a drag or a typed
  // number races the sibling list), so only the type and the floor are enforced here.
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;

  @IsOptional()
  @IsArray()
  @IsIn([...PAGE_FILE_TAGS], { each: true })
  fileTags?: PageFileTag[];

  // CS-2 card-modal extension. @IsOptional short-circuits validators on null → null clears.
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date invalide' })
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];
}

export class UpdatePageStageDto implements UpdatePageStageRequest {
  @IsIn([...PAGE_STAGES])
  stage!: PageStage;
}
