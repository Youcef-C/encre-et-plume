import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConnectionsModule } from '../connections/connections.module';
import { BlocksModule } from '../blocks/blocks.module';

/** MC-3 "Proposer une collab": authenticated POST/GET/PATCH /invitations. */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule, // F-5 seam: notify recipient on send, sender on response
    ConnectionsModule, // MC-8 seam: an accepted invite creates the mutual connection
    BlocksModule, // MC-10: blocked-pair check on create
  ],
  controllers: [InvitationsController],
  providers: [InvitationsService, PrismaService, RedisService, SessionGuard],
  exports: [InvitationsService], // CS-1: ProjectsService fans out MC-3 invitations from the wizard
})
export class InvitationsModule {}
