import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { AccountSummary } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { OnboardingService } from './onboarding.service';
import { OnboardingDto } from './dto/onboarding.dto';

/** POST /me/onboarding — authenticated; strictly self via req.accountId (no cross-account path). */
@Controller('me/onboarding')
@UseGuards(SessionGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @HttpCode(200)
  complete(@Req() req: AuthRequest, @Body() dto: OnboardingDto): Promise<AccountSummary> {
    return this.onboarding.complete(req.accountId, dto);
  }
}
