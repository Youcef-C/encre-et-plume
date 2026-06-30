import { IsIn, IsOptional, IsString } from 'class-validator';
import { SEARCH_RESULT_TYPES, type SearchResultType } from '@encre-et-plume/shared';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SEARCH_RESULT_TYPES)
  scope?: SearchResultType;
}
