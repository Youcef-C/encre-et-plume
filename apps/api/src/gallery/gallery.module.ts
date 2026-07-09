import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { AgeGateService } from '../age-gate/age-gate.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BlocksModule } from '../blocks/blocks.module';
import { CollectionsModule } from '../collections/collections.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    // DR-10: OptionalSessionGuard verifies the ep_session cookie when present.
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    BlocksModule, // MC-10: hiddenContent for blocked-pair illustration hiding
    CollectionsModule, // DR-12 (BE-4): assertCreator / assertOwnsCollections / appendMembership for publish
    MediaModule, // DR-12 (BE-4): MediaService.getForOwner for publish cover/illustration media resolution
  ],
  controllers: [GalleryController],
  providers: [GalleryService, AgeGateService, OptionalSessionGuard, SessionGuard, PrismaService, RedisService],
})
export class GalleryModule {}
