import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { PartnersResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { PartnersService, parsePartnersPagination } from './partners.service';
import { PartnersQueryDto } from './dto/partners-query.dto';

/**
 * MC-1 "Trouver un·e partenaire". Authenticated read-only directory: any signed-in account may
 * browse (F-2 roles don't gate reads here). The viewer's own card is excluded server-side via
 * req.accountId — never a client-supplied field.
 */
@Controller('partners')
@UseGuards(SessionGuard)
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get()
  find(@Query() dto: PartnersQueryDto, @Req() req: AuthRequest): Promise<PartnersResponse> {
    // page/pageSize come from the raw query (lenient parse + clamp — see parsePartnersPagination).
    const { page, pageSize } = parsePartnersPagination(req.query['page'], req.query['pageSize']);
    return this.service.findPartners({ ...dto, page, pageSize }, req.accountId);
  }
}
