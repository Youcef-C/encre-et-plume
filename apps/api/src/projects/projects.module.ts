import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { CollectionsModule } from '../collections/collections.module';

/**
 * CS-1 seam: authenticated GET /projects/mine — the sender's projects for MC-3's invite picker.
 * CS-12 folds illustration collections into the dashboard via CollectionsService (CollectionsModule).
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    CollectionsModule, // exports CollectionsService → CS-12 dashboard folds collections into /projects/mine
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, PrismaService, RedisService, SessionGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
