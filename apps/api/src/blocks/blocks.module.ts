import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/**
 * MC-10 "Block & mute": self-service /me/blocks. Exports BlocksService so the enforcement consumers
 * (MC-9 messaging, MC-8 connections, MC-3 invitations, MC-5 apply, DR-3 review reads) can call
 * isBlockedPair() / hiddenAuthorIds().
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [BlocksController],
  providers: [BlocksService, PrismaService, RedisService, SessionGuard],
  exports: [BlocksService],
})
export class BlocksModule {}
