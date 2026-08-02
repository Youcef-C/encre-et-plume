import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { MessageDto } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MessagesService } from './messages.service';
import { EditMessageDto } from './dto/edit-message.dto';

/**
 * CS-8 D-3 + MC-15 — message-level routes. A message id is unique across conversations, so these do
 * not need the conversation in the path (unlike the MC-9 routes, which are conversation-scoped), and
 * ONE set of routes serves all three surfaces (widget, salon dock, project Discussion).
 *
 * Membership first (a non-participant gets the same no-existence-leak 404 as an unknown id), then
 * author-only for edit/delete. Edit and delete are refused outright on a salon message (403) —
 * server-side, never merely hidden in the UI.
 */
@Controller('messages')
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  /** MC-15: the author fixes a typo. 403 on someone else's message and on any salon message. */
  @Patch(':id')
  edit(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: EditMessageDto): Promise<MessageDto> {
    return this.service.editMessage(req.accountId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.deleteMessage(req.accountId, id);
  }

  /** MC-15: like anyone's message in a thread I belong to. Idempotent — liking twice is one row. */
  @Post(':id/like')
  @HttpCode(204)
  like(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.setLike(req.accountId, id, true);
  }

  /** MC-15: remove my like. Idempotent — unliking what was never liked is a 204, not a 404. */
  @Delete(':id/like')
  @HttpCode(204)
  unlike(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.setLike(req.accountId, id, false);
  }
}
