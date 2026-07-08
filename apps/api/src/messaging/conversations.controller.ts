import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  constructor(private readonly service: MessagesService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<ConversationsResponse> {
    return this.service.listConversations(req.accountId, { cursor, limit: parseLimit(limit) });
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

  @Post(':id/read')
  read(@Req() req: AuthRequest, @Param('id') id: string): Promise<MarkReadResponse> {
    return this.service.markRead(req.accountId, id);
  }
}
