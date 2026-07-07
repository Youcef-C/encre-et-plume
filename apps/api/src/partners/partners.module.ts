import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** MC-1 "Trouver un·e partenaire": authenticated GET /partners (paginated creator directory). */
@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [PartnersController],
  providers: [PartnersService, PrismaService, RedisService, SessionGuard],
})
export class PartnersModule {}
