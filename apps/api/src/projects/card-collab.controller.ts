import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type {
  PageChecklistItemDto,
  PageCommentItem,
  ProjectLabelItem,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { CardCollabService } from './card-collab.service';
import {
  CreateChecklistItemDto,
  CreateLabelDto,
  CreatePageCommentDto,
  UpdateChecklistItemDto,
  UpdateLabelDto,
  UpdatePageCommentDto,
} from './dto/card-collab.dto';

/**
 * CS-2 card-modal extension routes. The story's paths span three roots (projects/:slug/labels,
 * labels/:id, pages/:id/checklist + checklist/:itemId, pages/:id/comments + comments/:id) so this
 * controller declares full paths on a prefix-less @Controller. All writes are member-gated in the
 * service; label reads follow the CS-1 visibility rule.
 */
@Controller()
@UseGuards(SessionGuard)
export class CardCollabController {
  constructor(private readonly cards: CardCollabService) {}

  // ── labels ─────────────────────────────────────────────────────────────────
  @Get('projects/:slug/labels')
  listLabels(@Req() req: AuthRequest, @Param('slug') slug: string): Promise<ProjectLabelItem[]> {
    return this.cards.listLabels(req.accountId, slug);
  }

  @Post('projects/:slug/labels')
  @HttpCode(201)
  createLabel(@Req() req: AuthRequest, @Param('slug') slug: string, @Body() dto: CreateLabelDto): Promise<ProjectLabelItem> {
    return this.cards.createLabel(req.accountId, slug, dto);
  }

  @Patch('labels/:id')
  updateLabel(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateLabelDto): Promise<ProjectLabelItem> {
    return this.cards.updateLabel(req.accountId, id, dto);
  }

  @Delete('labels/:id')
  @HttpCode(204)
  deleteLabel(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.cards.deleteLabel(req.accountId, id);
  }

  // ── checklist ────────────────────────────────────────────────────────────────
  @Post('pages/:id/checklist')
  @HttpCode(201)
  addChecklist(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CreateChecklistItemDto): Promise<PageChecklistItemDto> {
    return this.cards.addChecklistItem(req.accountId, id, dto);
  }

  @Patch('checklist/:itemId')
  updateChecklist(@Req() req: AuthRequest, @Param('itemId') itemId: string, @Body() dto: UpdateChecklistItemDto): Promise<PageChecklistItemDto> {
    return this.cards.updateChecklistItem(req.accountId, itemId, dto);
  }

  @Delete('checklist/:itemId')
  @HttpCode(204)
  deleteChecklist(@Req() req: AuthRequest, @Param('itemId') itemId: string): Promise<void> {
    return this.cards.deleteChecklistItem(req.accountId, itemId);
  }

  // ── comments ────────────────────────────────────────────────────────────────
  @Post('pages/:id/comments')
  @HttpCode(201)
  addComment(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CreatePageCommentDto): Promise<PageCommentItem> {
    return this.cards.addComment(req.accountId, id, dto);
  }

  @Patch('comments/:id')
  updateComment(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdatePageCommentDto): Promise<PageCommentItem> {
    return this.cards.updateComment(req.accountId, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  deleteComment(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.cards.deleteComment(req.accountId, id);
  }
}
