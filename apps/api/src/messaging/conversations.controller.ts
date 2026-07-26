import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  ConversationItem,
  ConversationsResponse,
  CreateConversationRequest,
  MarkReadResponse,
  MessageDto,
  MessagesPage,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { AddParticipantDto } from './dto/add-participant.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';

function parseLimit(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * MC-9 messaging REST. All routes SessionGuard'd; the viewer is always `req.accountId` (never a client
 * field). Participant-only reads/posts + no-existence-leak 404s live in MessagesService. Realtime
 * delivery/typing/presence is the WS gateway; these routes cover history, send, create, mark-read.
 */
@Controller('conversations')
@UseGuards(SessionGuard)
export class ConversationsController {
  // ponytail: PUB-6 seam — "Signaler ce message" + POST /reports targetType 'message' land with PUB-6
  // (MC-10 plan §8: no reports module exists yet; don't invent a one-off endpoint here).
  constructor(private readonly service: MessagesService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ): Promise<ConversationsResponse> {
    return this.service.listConversations(req.accountId, {
      cursor,
      limit: parseLimit(limit),
      filter: filter === 'requests' ? 'requests' : undefined,
    });
  }

  @Get(':id/messages')
  messages(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<MessagesPage> {
    return this.service.getMessages(req.accountId, id, { cursor, limit: parseLimit(limit) });
  }

  @Post(':id/messages')
  send(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SendMessageDto): Promise<MessageDto> {
    return this.service.sendMessage(req.accountId, id, dto);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateConversationDto): Promise<ConversationItem> {
    return this.service.createConversation(req.accountId, dto as CreateConversationRequest);
  }

  // MC-9 delta: recipient accepts/declines a DM request. Recipient-only authz lives in the service
  // (a non-recipient caller gets the same no-existence-leak 404).
  @Patch(':id/request')
  respondToRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: RespondRequestDto,
  ): Promise<ConversationItem> {
    return this.service.respondToRequest(req.accountId, id, dto.action);
  }

  // Follow-up 5b: the group name is optional at creation, so it must be settable later. Creator-only
  // (same owner rule as add/kick) — resolved from Conversation.createdBy in the service, never a
  // client claim. An empty name clears it back to the participant-derived title.
  @Patch(':id')
  rename(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: RenameConversationDto,
  ): Promise<ConversationItem> {
    return this.service.renameConversation(req.accountId, id, dto.name);
  }

  @Post(':id/read')
  read(@Req() req: AuthRequest, @Param('id') id: string): Promise<MarkReadResponse> {
    return this.service.markRead(req.accountId, id);
  }

  // MC-12: group management. Creator-only add/kick + open-to-all leave are enforced server-side in the
  // service (createdBy + membership resolved from the DB, never a client claim).
  @Post(':id/participants')
  addParticipant(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: AddParticipantDto,
  ): Promise<ConversationItem> {
    return this.service.addParticipant(req.accountId, id, dto);
  }

  // One route: the literal 'me' path is a leave (any member), any other id is a kick (creator only).
  // Default 200: kick returns the updated ConversationItem, leave returns an empty body (void).
  @Delete(':id/participants/:accountId')
  async removeParticipant(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('accountId') targetId: string,
  ): Promise<ConversationItem | void> {
    if (targetId === 'me') return this.service.leaveConversation(req.accountId, id);
    return this.service.removeParticipant(req.accountId, id, targetId);
  }
}
