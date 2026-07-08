import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { PresenceService } from './presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchesModule } from '../matches/matches.module';

/**
 * MC-8 "Contacts & connexions": authenticated /contacts, /connections/*, /people/search, /presence.
 * Exports ConnectionsService so the MC-3 (invitations) and MC-7 (received applications) accept paths
 * can call ensureConnected().
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule, // F-5: notify recipient on request, requester on accept
    MatchesModule, // MC-2: suggestions engine (delegated)
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, PresenceService, PrismaService, RedisService, SessionGuard],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
