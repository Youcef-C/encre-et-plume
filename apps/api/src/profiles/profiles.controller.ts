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
import { ProfilesService } from './profiles.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  /** Public — no guard. */
  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<ProfileResponse> {
    return this.profilesService.getBySlug(slug);
  }

  /** Public — no guard. */
  @Get(':slug/portfolio')
  getPortfolio(@Param('slug') slug: string): Promise<PortfolioItemResponse[]> {
    return this.profilesService.getPortfolio(slug);
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
