import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { ApplicationDto, ReceivedApplicationsResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ReceivedApplicationsService } from './received-applications.service';
import { DecideApplicationDto } from './dto/decide-application.dto';

/**
 * MC-7 "Mes appels à projets" — the owner-facing review of applications received on the caller's
 * OWN calls. Authenticated (SessionGuard); ownership is derived from `call.authorId` in the service,
 * never a client claim. Root-scoped controller because the two routes have distinct paths.
 */
@Controller()
@UseGuards(SessionGuard)
export class ReceivedApplicationsController {
  constructor(private readonly service: ReceivedApplicationsService) {}

  @Get('me/calls/applications')
  list(@Req() req: AuthRequest): Promise<ReceivedApplicationsResponse> {
    return this.service.list(req.accountId);
  }

  // Accept/reject: application id from the path, owner from the session; 404 unknown/not-owner,
  // 409 already decided, 400 on an out-of-enum status.
  @Patch('applications/:id')
  decide(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: DecideApplicationDto,
  ): Promise<ApplicationDto> {
    return this.service.decide(req.accountId, id, dto.status);
  }
}
