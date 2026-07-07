import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type {
  ApplicationDto,
  CallCard,
  CallsBoardResponse,
  CallsResponse,
  CallStatus,
  CreatorRole,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { CallsService, parseCallsLimit, type CallsBoardQueryParsed } from './calls.service';
import { CreateCallDto } from './dto/create-call.dto';
import { CloseCallDto } from './dto/close-call.dto';
import { ApplyToCallDto } from './dto/apply-to-call.dto';

/** Normalize a query value into a string[] (repeated key → array, single → one-element array). */
function toArray(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  return (Array.isArray(raw) ? raw : [raw]).map(String);
}

function parseBoardQuery(query: Record<string, unknown>): CallsBoardQueryParsed {
  const role = query['role'];
  const status = query['status'];
  const page = typeof query['page'] === 'string' ? Number.parseInt(query['page'], 10) : NaN;
  return {
    role: role === 'dessinateur' || role === 'scenariste' ? (role as CreatorRole) : undefined,
    genre: toArray(query['genre']),
    status: status === 'open' || status === 'closed' || status === 'all' ? (status as CallStatus | 'all') : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : undefined,
  };
}

/**
 * MC-1 preview (`?limit=`) + MC-4 board (filters/pagination), POST create, PATCH owner close-early.
 * All routes authenticated (SessionGuard); the owner is always the session accountId, never a client
 * field. Any signed-in creator may post; only the owner may close early (enforced in the service).
 */
@Controller('calls')
@UseGuards(SessionGuard)
export class CallsController {
  constructor(private readonly service: CallsService) {}

  @Get()
  find(@Req() req: AuthRequest): Promise<CallsResponse | CallsBoardResponse> {
    const limit = req.query['limit'];
    if (limit !== undefined) return this.service.findOpenCalls(parseCallsLimit(limit));
    return this.service.findBoard(parseBoardQuery(req.query), req.accountId);
  }

  @Post()
  @HttpCode(201)
  create(@Req() req: AuthRequest, @Body() dto: CreateCallDto): Promise<CallCard> {
    return this.service.createCall(req.accountId, dto);
  }

  @Patch(':id')
  close(@Req() req: AuthRequest, @Param('id') id: string, @Body() _dto: CloseCallDto): Promise<CallCard> {
    // _dto validates the body is exactly { status: 'closed' } (400 otherwise); the action is fixed.
    return this.service.closeEarly(req.accountId, id);
  }

  // MC-5 "Candidater": the applicant is always the session account, never a body field.
  @Post(':id/applications')
  @HttpCode(201)
  apply(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ApplyToCallDto): Promise<ApplicationDto> {
    return this.service.apply(req.accountId, id, dto);
  }
}
