import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { WorksController } from './works.controller';
import { WorksService } from './works.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [
    // DR-10: OptionalSessionGuard verifies the ep_session cookie when present.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    BlocksModule, // MC-10: per-viewer review filtering (hiddenAuthorIds)
  ],
  controllers: [WorksController],
  providers: [WorksService, AgeGateService, OptionalSessionGuard, PrismaService, RedisService],
})
export class WorksModule {}
