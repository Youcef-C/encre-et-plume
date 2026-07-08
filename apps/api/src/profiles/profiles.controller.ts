import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ProfileResponse, PortfolioItemResponse } from '@encre-et-plume/shared';
import { SessionGuard, type AuthRequest } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /** Public — OptionalSessionGuard so a signed-in viewer gets MC-10 directional block flags. */
  @Get(':slug')
  @UseGuards(OptionalSessionGuard)
  getBySlug(@Param('slug') slug: string, @Req() req: AuthRequest): Promise<ProfileResponse> {
    return this.profilesService.getBySlug(slug, req.accountId);
  }

  /** Public — OptionalSessionGuard so a blocked-pair viewer gets an empty portfolio (D8c). */
  @Get(':slug/portfolio')
  @UseGuards(OptionalSessionGuard)
  getPortfolio(@Param('slug') slug: string, @Req() req: AuthRequest): Promise<PortfolioItemResponse[]> {
    return this.profilesService.getPortfolio(slug, req.accountId);
  }

  /** Owner-only: session account edits their own row — no slug needed (D1). */
  @UseGuards(SessionGuard)
  @Patch('me')
  updateMine(
    @Req() req: AuthRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.profilesService.updateMine(req.accountId, dto);
  }
}
