import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { BlockDto, BlockKind, BlocksResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/create-block.dto';

const KINDS: BlockKind[] = ['block', 'mute'];

/**
 * MC-10 "Comptes bloqués" — self-service only (F-2). The blocker is always the session accountId,
 * never a client field; enforcement of the block itself lives in the messaging/invite/connection/
 * apply/review-read services, not here.
 */
@Controller('me/blocks')
@UseGuards(SessionGuard)
export class BlocksController {
  constructor(private readonly service: BlocksService) {}

  @Get()
  list(@Req() req: AuthRequest): Promise<BlocksResponse> {
    return this.service.list(req.accountId);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateBlockDto): Promise<BlockDto> {
    return this.service.create(req.accountId, dto);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Req() req: AuthRequest,
    @Param('userId') userId: string,
    @Query('kind') kind?: string,
  ): Promise<void> {
    if (!kind || !KINDS.includes(kind as BlockKind)) throw new BadRequestException('Type invalide.');
    await this.service.remove(req.accountId, userId, kind as BlockKind);
  }
}
