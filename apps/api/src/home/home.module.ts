import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { BlocksModule } from '../blocks/blocks.module';

@Module({
  imports: [
    // MC-10: OptionalSessionGuard verifies the ep_session cookie when present (list filtering).
    JwtModule.register({ secret: getJwtSecret(), signOptions: { expiresIn: '7d' } }),
    BlocksModule,
  ],
  controllers: [HomeController],
  providers: [HomeService, PrismaService, RedisService, OptionalSessionGuard],
})
export class HomeModule {}
