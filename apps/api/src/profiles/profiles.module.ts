import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    BlocksModule, // MC-10: pairFlags / isBlockedPair for directional block state + portfolio hiding
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, SessionGuard, OptionalSessionGuard, PrismaService, RedisService],
})
export class ProfilesModule {}
