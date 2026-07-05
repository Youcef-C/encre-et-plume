import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { EmailModule } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OptionalSessionGuard } from '../auth/guards/optional-session.guard';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

/** F-21 support & contact: public POST /support/tickets (visitors + members). */
@Module({
  imports: [
    EmailModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [SupportController],
  providers: [SupportService, PrismaService, RedisService, OptionalSessionGuard],
})
export class SupportModule {}
