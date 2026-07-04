import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** DR-9: authenticated POST/DELETE /reactions/{like,save} + GET /reactions/state. */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ReactionsController],
  providers: [ReactionsService, PrismaService, RedisService, SessionGuard],
})
export class ReactionsModule {}
