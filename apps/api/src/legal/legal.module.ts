import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [LegalController],
  providers: [LegalService, PrismaService, RedisService],
  exports: [LegalService],
})
export class LegalModule {}
