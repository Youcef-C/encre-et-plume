import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MediaModule } from '../media/media.module';
import { ConnectionsModule } from '../connections/connections.module';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [
    MediaModule, // exports MediaService → AccountsService.setAvatar
    ConnectionsModule, // MC-13: connectedIds for reachable-user search
    BlocksModule, // MC-13: blockedPairIds for reachable-user search
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AccountsController],
  providers: [AccountsService, SessionGuard, RolesGuard, PrismaService, RedisService],
})
export class AccountsModule {}
