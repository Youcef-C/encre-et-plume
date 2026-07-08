import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type {
  ConnectionRequestDto,
  ConnectionRequestsResponse,
  ConnectionSuggestionsResponse,
  ContactsResponse,
  PeopleSearchResponse,
  PresenceResponse,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ConnectionsService } from './connections.service';
import { PresenceService } from './presence.service';
import { CreateConnectionRequestDto } from './dto/create-connection-request.dto';
import { DecideConnectionRequestDto } from './dto/decide-connection-request.dto';

const PRESENCE_MAX_IDS = 100;

/** Parse the `userIds` param: comma-separated string OR repeated key; drop blanks; cap at 100. */
export function parseUserIds(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(',') : [];
  return parts.map((s) => s.trim()).filter(Boolean).slice(0, PRESENCE_MAX_IDS);
}

/**
 * MC-8 "Contacts & connexions". Root-scoped (paths differ) and fully authenticated (SessionGuard).
 * The viewer id is always `req.accountId` — never a client-supplied field. Recipient-only / owner-only
 * rules and no-existence-leak 404s live in the service.
 */
@Controller()
@UseGuards(SessionGuard)
export class ConnectionsController {
  constructor(
    private readonly service: ConnectionsService,
    private readonly presenceService: PresenceService,
  ) {}

  @Get('contacts')
  listContacts(@Req() req: AuthRequest): Promise<ContactsResponse> {
    return this.service.listContacts(req.accountId);
  }

  @Delete('contacts/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeContact(@Req() req: AuthRequest, @Param('userId') userId: string): Promise<void> {
    return this.service.removeContact(req.accountId, userId);
  }

  @Get('connections/requests')
  listRequests(@Req() req: AuthRequest): Promise<ConnectionRequestsResponse> {
    return this.service.listRequests(req.accountId);
  }

  @Post('connections/requests')
  createRequest(@Req() req: AuthRequest, @Body() dto: CreateConnectionRequestDto): Promise<ConnectionRequestDto> {
    return this.service.createRequest(req.accountId, dto);
  }

  @Patch('connections/requests/:id')
  decide(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: DecideConnectionRequestDto): Promise<ConnectionRequestDto> {
    return this.service.decide(req.accountId, id, dto.status);
  }

  @Get('connections/suggestions')
  suggestions(@Req() req: AuthRequest): Promise<ConnectionSuggestionsResponse> {
    return this.service.suggestions(req.accountId);
  }

  @Get('people/search')
  peopleSearch(@Req() req: AuthRequest): Promise<PeopleSearchResponse> {
    return this.service.peopleSearch(req.accountId, String(req.query['q'] ?? ''));
  }

  @Get('presence')
  async presence(@Req() req: AuthRequest): Promise<PresenceResponse> {
    const ids = parseUserIds(req.query['userIds']);
    const map = await this.presenceService.get(ids);
    return { items: ids.map((userId) => ({ userId, ...(map[userId] ?? { online: false, lastSeen: null }) })) };
  }
}
