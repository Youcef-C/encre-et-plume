import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ConsentResponse, LegalDocumentDto } from '@encre-et-plume/shared';
import { LEGAL_KINDS } from '@encre-et-plume/shared';
import { LegalService } from './legal.service';
import { ConsentBodyDto } from './dto/consent.dto';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';

@Controller('')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  /** GET /legal/:kind — public. Returns the current published document. */
  @Get('legal/:kind')
  async getCurrent(@Param('kind') kind: string): Promise<LegalDocumentDto> {
    if (!LEGAL_KINDS.includes(kind as (typeof LEGAL_KINDS)[number])) {
      throw new NotFoundException();
    }
    return this.legalService.getCurrent(kind as (typeof LEGAL_KINDS)[number]);
  }

  /** POST /consents — authenticated. Records a consent for document@version. */
  @UseGuards(SessionGuard)
  @Post('consents')
  async recordConsent(
    @Body() dto: ConsentBodyDto,
    @Req() req: AuthRequest,
  ): Promise<ConsentResponse> {
    await this.legalService.recordConsent(req.accountId, dto.document, dto.version, req.ip);
    return { recorded: true };
  }
}
