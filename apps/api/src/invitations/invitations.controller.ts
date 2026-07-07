import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { InvitationDirection, InvitationDto, InvitationsResponse } from '@encre-et-plume/shared';
import { INVITATIONS_MAX_PAGE_SIZE, INVITATIONS_PAGE_SIZE } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';

/** Required `direction`: 'sent' | 'received'. Anything else → 400 (trust boundary). */
export function parseDirection(raw: unknown): InvitationDirection {
  if (raw === 'sent' || raw === 'received') return raw;
  throw new BadRequestException('Paramètre direction invalide.');
}

/** Lenient page parse: bad/absent → 1 (never 400), same convention as /partners /matches. */
export function parsePage(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Lenient pageSize parse: bad/absent → default, clamped to max (never 400). */
export function parsePageSize(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, INVITATIONS_MAX_PAGE_SIZE) : INVITATIONS_PAGE_SIZE;
}

/**
 * MC-3 "Proposer une collab". All routes authenticated (SessionGuard). Every list/response is scoped
 * to the session accountId — never a client-supplied id. F-2 authz roles don't gate these (any signed-in
 * creator may send/respond); the recipient-only rule for respond lives in the service.
 */
@Controller('invitations')
@UseGuards(SessionGuard)
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateInvitationDto): Promise<InvitationDto> {
    return this.service.create(req.accountId, dto);
  }

  @Get()
  list(@Req() req: AuthRequest): Promise<InvitationsResponse> {
    const direction = parseDirection(req.query['direction']);
    const page = parsePage(req.query['page']);
    const pageSize = parsePageSize(req.query['pageSize']);
    return this.service.list(req.accountId, direction, page, pageSize);
  }

  @Patch(':id')
  respond(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: RespondInvitationDto,
  ): Promise<InvitationDto> {
    return this.service.respond(req.accountId, id, dto);
  }
}
