import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ProjectsController } from './projects.controller';
import { PagesController } from './pages.controller';
import { CardCollabController } from './card-collab.controller';
import { AssetsController, AssetRootController } from './assets.controller';
import { ProjectsService } from './projects.service';
import { PagesService } from './pages.service';
import { CardCollabService } from './card-collab.service';
import { AssetsService } from './assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SlugService } from '../slug/slug.service';
import { S3StorageService } from '../media/s3-storage.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { CollectionsModule } from '../collections/collections.module';
import { MediaModule } from '../media/media.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { CallsModule } from '../calls/calls.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * CS-1 seam: authenticated GET /projects/mine — the sender's projects for MC-3's invite picker.
 * CS-12 folds illustration collections into the dashboard via CollectionsService (CollectionsModule).
 * CS-1 POST /projects seeds the œuvre (CollectionsService helpers), the cover (MediaService), the
 * MC-3 invitations (InvitationsService) and the MC-4 call (CallsService).
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    CollectionsModule, // exports CollectionsService → dashboard folds collections + CS-1 contest/soutien helpers
    MediaModule, // CS-1/CS-2 cover resolution (F-10 presigned upload)
    InvitationsModule, // CS-1 invite fan-out (MC-3)
    CallsModule, // CS-1 "Appel à projets" seed (MC-4)
    NotificationsModule, // CS-2 stage→corrections notify (F-5)
  ],
  controllers: [ProjectsController, PagesController, CardCollabController, AssetsController, AssetRootController],
  providers: [ProjectsService, PagesService, CardCollabService, AssetsService, PrismaService, RedisService, SlugService, S3StorageService, SessionGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
