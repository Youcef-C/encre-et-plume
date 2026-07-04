import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { CreatorsSearchProvider, SEARCH_PROVIDERS } from './search.providers';
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
    // ponytail: DR-3 adds WorksSearchProvider here; DR-5 adds IllustrationsSearchProvider
    { provide: SEARCH_PROVIDERS, useFactory: (p: CreatorsSearchProvider) => [p], inject: [CreatorsSearchProvider] },
    PrismaService,
    SessionGuard,
    RedisService,
  ],
})
export class SearchModule {}
