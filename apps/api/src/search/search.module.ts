import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { CreatorsSearchProvider, IllustrationsSearchProvider, SEARCH_PROVIDERS, WorksSearchProvider } from './search.providers';
import { PrismaService } from '../prisma/prisma.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    CreatorsSearchProvider,
    WorksSearchProvider,
    IllustrationsSearchProvider,
    // One provider per SEARCH_RESULT_TYPES entry — the contract declared all three from F-7, but
    // only `creators` was ever registered, so the search found people and never a title.
    {
      provide: SEARCH_PROVIDERS,
      useFactory: (works: WorksSearchProvider, creators: CreatorsSearchProvider, illustrations: IllustrationsSearchProvider) => [
        works,
        creators,
        illustrations,
      ],
      inject: [WorksSearchProvider, CreatorsSearchProvider, IllustrationsSearchProvider],
    },
    PrismaService,
    SessionGuard,
    RedisService,
  ],
})
export class SearchModule {}
