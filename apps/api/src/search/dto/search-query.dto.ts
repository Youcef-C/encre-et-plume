import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SEARCH_RESULT_TYPES, type SearchResultType } from '@encre-et-plume/shared';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100) // L: cap free-text length
  q?: string;

  @IsOptional()
  @IsIn(SEARCH_RESULT_TYPES)
  scope?: SearchResultType;
}
