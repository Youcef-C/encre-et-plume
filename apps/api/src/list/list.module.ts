import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ListController } from './list.controller';
import { ListService } from './list.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** DR-8 "Ma liste & coups de cœur": authenticated GET /me/list, GET /me/likes, DELETE /me/list/:slug. */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ListController],
  providers: [ListService, PrismaService, RedisService, SessionGuard],
})
export class ListModule {}
