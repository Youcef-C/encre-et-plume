import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** CS-1 seam: authenticated GET /projects/mine — the sender's projects for MC-3's invite picker. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, PrismaService, RedisService, SessionGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
