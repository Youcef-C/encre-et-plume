import { Body, Controller, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { ReadingProgressService } from './reading-progress.service';
import { ReadingProgressDto } from './dto/reading-progress.dto';

/** PUT /me/reading-progress — authenticated; strictly self via req.accountId (DR-4, B9/B11). */
@Controller('me/reading-progress')
@UseGuards(SessionGuard)
export class ReadingProgressController {
  constructor(private readonly service: ReadingProgressService) {}

  @Put()
  @HttpCode(204)
  async save(@Req() req: AuthRequest, @Body() dto: ReadingProgressDto): Promise<void> {
    await this.service.save(req.accountId, dto);
  }
}
