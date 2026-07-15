import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  CorrectionDto,
  CorrectionListResponse,
  CorrectionStatus,
  CorrectionType,
  ReviewPayload,
  ValidateReviewResponse,
} from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { CorrectionsService } from './corrections.service';
import { CreateCorrectionDto, UpdateCorrectionDto } from './dto/correction.dto';

/** Optional positive int from a query string; undefined when absent/blank. */
function toInt(v?: string): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
}

/**
 * CS-5 review + corrections routes. Page-scoped routes live on /pages (CS-2/CS-4 style); the
 * per-correction status/delete routes live on /corrections. Every route is member-gated in the service.
 */
@Controller('pages')
@UseGuards(SessionGuard)
export class CorrectionsPagesController {
  constructor(private readonly corrections: CorrectionsService) {}

  /** Two-version review payload (files, versions, both contents, corrections). Auto-picks
   *  filedAgainstVersion↔head when from/to omitted; ?file= chooses the reviewed file. */
  @Get(':id/review')
  review(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('file') file?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ReviewPayload> {
    return this.corrections.getReview(req.accountId, id, { file, from: toInt(from), to: toInt(to) });
  }

  /** File a correction (scenario from the editor's "Demander une correction", dessin from the review
   *  screen). Stamps filedAgainstVersion from the file's current head. */
  @Post(':id/corrections')
  create(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CreateCorrectionDto): Promise<CorrectionDto> {
    return this.corrections.create(req.accountId, id, dto as never);
  }

  /** Filtered, paginated list of a page's corrections (both types). */
  @Get(':id/corrections')
  list(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('type') type?: CorrectionType,
    @Query('status') status?: CorrectionStatus,
    @Query('page') page?: string,
  ): Promise<CorrectionListResponse> {
    return this.corrections.list(req.accountId, id, { type, status, page: toInt(page) });
  }

  /** Validate the review round: requires ALL corrections corrigé, performs the CS-2 Corrections→Propre
   *  transition (409 if any unresolved / wrong stage). Idempotent on an already-propre card. */
  @Post(':id/review/validate')
  validate(@Req() req: AuthRequest, @Param('id') id: string): Promise<ValidateReviewResponse> {
    return this.corrections.validate(req.accountId, id);
  }
}

@Controller('corrections')
@UseGuards(SessionGuard)
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  /** Change status (author or assignee only). Marking corrigé stamps resolvedInVersion = head. */
  @Patch(':id')
  updateStatus(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateCorrectionDto): Promise<CorrectionDto> {
    return this.corrections.updateStatus(req.accountId, id, dto);
  }

  /** Delete a review note (author only). */
  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id') id: string): Promise<void> {
    return this.corrections.remove(req.accountId, id);
  }
}
