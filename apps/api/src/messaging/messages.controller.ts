import { Controller, Delete, HttpCode, Param, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { MessagesService } from './messages.service';

/**
 * CS-8 D-3 — message-level routes. A message id is unique across conversations, so its destroy does
 * not need the conversation in the path (unlike the MC-9 routes, which are conversation-scoped).
 * Author-only; a non-participant gets the same no-existence-leak 404 as an unknown id.
 */
@Controller('messages')
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.service.deleteMessage(req.accountId, id);
  }
}
