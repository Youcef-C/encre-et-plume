import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { AgeGateService } from '../age-gate/age-gate.service';
import { BlocksModule } from '../blocks/blocks.module';
import { AnalyticsModule } from '../analytics/analytics.module';

/** DR-4 reader "Lecteur": public chapter pages route + authenticated /me/favorites, /me/reading-progress. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    BlocksModule, // MC-10: hiddenContent for blocked-pair chapter hiding
    AnalyticsModule, // F-23: exports AnalyticsService — the reader emits `read` through it
  ],
  controllers: [ReaderController, FavoritesController, ReadingProgressController],
  providers: [
    ReaderService,
    FavoritesService,
    ReadingProgressService,
    PrismaService,
    RedisService,
    SessionGuard,
    OptionalSessionGuard,
    AgeGateService,
  ],
})
export class ReaderModule {}
