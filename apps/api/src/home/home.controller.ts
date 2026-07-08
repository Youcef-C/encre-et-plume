import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type {
  Announcement,
  FeaturedWork,
  RankingRow,
  ScheduledRelease,
  TopCreatorsResponse,
  TrendingWork,
} from '@encre-et-plume/shared';
import { HomeService } from './home.service';
import { BlocksService } from '../blocks/blocks.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import type { AuthRequest } from '../auth/guards/session.guard';

/**
 * DR-1 home showroom — public, read-only (no auth/guard: anonymous visitors browse freely).
 * MC-10 round 2 (B12): work-content routes drop the blocked pair's works for a signed-in member of a
 * blocked pair, post-cache (never mutating the cached array). Creator/announcement routes stay (D9).
 */
@Controller('home')
export class HomeController {
  constructor(
    private readonly homeService: HomeService,
    private readonly blocks: BlocksService,
  ) {}

  @Get('featured')
  @UseGuards(OptionalSessionGuard)
  async featured(@Req() req: AuthRequest): Promise<FeaturedWork[]> {
    const items = await this.homeService.getFeatured();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((w) => !hc.workIds.has(w.id)) : items;
  }

  @Get('trending-this-week')
  @UseGuards(OptionalSessionGuard)
  async trendingThisWeek(@Req() req: AuthRequest): Promise<TrendingWork[]> {
    const items = await this.homeService.getTrendingThisWeek();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((w) => !hc.workIds.has(w.id)) : items;
  }

  @Get('top-creators')
  topCreators(): Promise<TopCreatorsResponse> {
    return this.homeService.getTopCreators();
  }

  @Get('scheduled-releases')
  @UseGuards(OptionalSessionGuard)
  async scheduledReleases(@Req() req: AuthRequest): Promise<ScheduledRelease[]> {
    const items = await this.homeService.getScheduledReleases();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((r) => !hc.workIds.has(r.workId)) : items;
  }

  @Get('ranking/all-time')
  @UseGuards(OptionalSessionGuard)
  async rankingAllTime(@Req() req: AuthRequest): Promise<RankingRow[]> {
    const items = await this.homeService.getRankingAllTime();
    const hc = req.accountId ? await this.blocks.hiddenContent(req.accountId) : null;
    return hc ? items.filter((w) => !hc.workIds.has(w.id)) : items;
  }

  @Get('announcements')
  announcements(): Promise<Announcement[]> {
    return this.homeService.getAnnouncements();
  }
}
