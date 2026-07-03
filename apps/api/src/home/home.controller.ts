import { Controller, Get } from '@nestjs/common';
import type {
  Announcement,
  FeaturedWork,
  RankingRow,
  ScheduledRelease,
  TopCreatorsResponse,
  TrendingWork,
} from '@encre-et-plume/shared';
import { HomeService } from './home.service';

/** DR-1 home showroom — public, read-only (no auth/guard: anonymous visitors browse freely). */
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('featured')
  featured(): Promise<FeaturedWork[]> {
    return this.homeService.getFeatured();
  }

  @Get('trending-this-week')
  trendingThisWeek(): Promise<TrendingWork[]> {
    return this.homeService.getTrendingThisWeek();
  }

  @Get('top-creators')
  topCreators(): Promise<TopCreatorsResponse> {
    return this.homeService.getTopCreators();
  }

  @Get('scheduled-releases')
  scheduledReleases(): Promise<ScheduledRelease[]> {
    return this.homeService.getScheduledReleases();
  }

  @Get('ranking/all-time')
  rankingAllTime(): Promise<RankingRow[]> {
    return this.homeService.getRankingAllTime();
  }

  @Get('announcements')
  announcements(): Promise<Announcement[]> {
    return this.homeService.getAnnouncements();
  }
}
