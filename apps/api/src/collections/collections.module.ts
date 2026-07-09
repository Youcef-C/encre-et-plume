import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SlugService } from '../slug/slug.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    JwtModule.register({ secret: getJwtSecret(), signOptions: { expiresIn: '7d' } }),
    MediaModule, // exports MediaService → cover resolution (F-10 presigned upload, avatar pattern)
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService, SessionGuard, OptionalSessionGuard, PrismaService, RedisService, SlugService],
  exports: [CollectionsService], // GalleryModule reuses assertCreator + assertOwnsCollections + appendMembership (BE-4)
})
export class CollectionsModule {}
