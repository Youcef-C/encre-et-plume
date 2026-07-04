import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReadingHistoryController } from './reading-history.controller';
import { ReadingHistoryService } from './reading-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** DR-11 reading history & resume: authenticated GET /me/reading-history(/:workSlug). */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ReadingHistoryController],
  providers: [ReadingHistoryService, PrismaService, RedisService, SessionGuard],
})
export class ReadingHistoryModule {}
