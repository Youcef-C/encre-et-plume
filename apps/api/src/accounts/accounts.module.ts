import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AccountsController],
  providers: [AccountsService, SessionGuard, RolesGuard, PrismaService, RedisService],
})
export class AccountsModule {}
