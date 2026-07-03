import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** PUT /me/reading-progress body — DR-4. */
export class ReadingProgressDto {
  @IsString()
  @IsNotEmpty()
  workSlug!: string;

  @IsInt()
  @Min(1)
  chapterNumber!: number;

  @IsInt()
  @Min(1)
  page!: number;
}
