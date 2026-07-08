import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** MC-2 "Suggestions — par affinité de style & genre": authenticated GET /matches/suggestions. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MatchesController],
  providers: [MatchesService, PrismaService, RedisService, SessionGuard],
  exports: [MatchesService], // MC-8 ConnectionsModule delegates /connections/suggestions here
})
export class MatchesModule {}
