import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { SearchResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';

@UseGuards(SessionGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Req() req: AuthRequest, @Query() dto: SearchQueryDto): Promise<SearchResponse> {
    return this.searchService.search(dto.q ?? '', req.accountId, dto.scope);
  }
}
