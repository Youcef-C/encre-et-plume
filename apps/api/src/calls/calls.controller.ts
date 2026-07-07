import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { CallsResponse } from '@encre-et-plume/shared';
import { SessionGuard } from '../auth/guards/session.guard';
import { CallsService, parseCallsLimit } from './calls.service';

/**
 * MC-1 "Appels à projets" preview. JWT-guarded like /partners (embedded on the authenticated
 * "Trouver un·e partenaire" page). MC-4 extends this module with the full board + POST.
 */
@Controller('calls')
@UseGuards(SessionGuard)
export class CallsController {
  constructor(private readonly service: CallsService) {}

  @Get()
  find(@Query('limit') limit?: string): Promise<CallsResponse> {
    return this.service.findOpenCalls(parseCallsLimit(limit));
  }
}
