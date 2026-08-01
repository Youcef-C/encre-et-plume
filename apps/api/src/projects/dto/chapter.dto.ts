import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { CreateChapterRequest, UpdateChapterPageOrderRequest, UpdateChapterRequest } from '@encre-et-plume/shared';

// Shape validation only — membership, « Écriture », number uniqueness and page ownership live in
// ChaptersService (the server is the truth for the collision warning, never the client).

// R2-2: both optional so the Tableau "＋" chip can POST an empty body; the service assigns the next
// number transactionally and defaults the title. A *provided* blank title is still a 400 there.
export class CreateChapterDto implements Omit<CreateChapterRequest, 'targetPages'> {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  number?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resume?: string;

  // R3-2. Kept nullable at the wire so R2-7's retired "clear the target" body gets the service's
  // French 400 rather than class-validator's shape error; the positive-integer rule lives there too.
  @IsOptional()
  @IsInt()
  targetPages?: number | null;
}

// CS-6 — shape only. That the ids are exactly THIS chapter's current cards (a complete permutation)
// is the service's check: it needs the DB, and it is the rule that keeps the slots contiguous.
export class UpdateChapterPageOrderDto implements UpdateChapterPageOrderRequest {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  pageIds!: string[];
}

export class UpdateChapterDto implements Omit<UpdateChapterRequest, 'targetPages'> {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  number?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resume?: string;

  // CS-6 — « Couverture » toggle.
  @IsOptional()
  @IsBoolean()
  hasCover?: boolean;

  @IsOptional()
  @IsInt()
  targetPages?: number | null;
}
