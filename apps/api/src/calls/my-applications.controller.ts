import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { MyApplicationRow, MyApplicationsResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MyApplicationsService } from './my-applications.service';
import { MyApplicationsQueryDto } from './dto/my-applications-query.dto';
import { EditApplicationDto } from './dto/edit-application.dto';

/** Lenient page parse — bad/absent/0/negative → 1 (never a 400), same style as the board query. */
export function parseApplicationsPage(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * MC-6 "Mes candidatures" — GET /me/applications. Authenticated (SessionGuard); the applicant is
 * always the session accountId, never a client field. Read-only, self-scoped, paginated.
 */
@Controller('me/applications')
@UseGuards(SessionGuard)
export class MyApplicationsController {
  constructor(private readonly service: MyApplicationsService) {}

  @Get()
  find(@Query() dto: MyApplicationsQueryDto, @Req() req: AuthRequest): Promise<MyApplicationsResponse> {
    const page = parseApplicationsPage(req.query['page']);
    return this.service.list(req.accountId, { status: dto.status ?? 'all', page });
  }

  // MC-6 amendment #7: the caller's own application detail (message + all samples + call ref) for the
  // edit view. Applicant = session account. 404 if unknown/not the caller's.
  @Get(':id')
  detail(@Req() req: AuthRequest, @Param('id') id: string): Promise<MyApplicationRow> {
    return this.service.get(req.accountId, id);
  }

  // MC-6 amendment #7: edit the caller's own PENDING application (message + samples). Applicant from
  // the session, never the body. 409 if already decided; 404 if not the caller's.
  @Patch(':id')
  edit(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: EditApplicationDto): Promise<MyApplicationRow> {
    return this.service.edit(req.accountId, id, dto);
  }

  // MC-6 withdraw "Retirer sa candidature": the applicant is always the session account, never a
  // body field. 204 No Content on success; 404 if not the caller's/unknown; 409 if already decided.
  @Delete(':id')
  @HttpCode(204)
  withdraw(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.withdraw(req.accountId, id);
  }
}
