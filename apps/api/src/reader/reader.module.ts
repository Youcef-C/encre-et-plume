import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReaderController } from './reader.controller';
import { ReaderService } from './reader.service';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { ReadingProgressController } from './reading-progress.controller';
import { ReadingProgressService } from './reading-progress.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SessionGuard } from '../auth/guards/session.guard';

/** DR-4 reader "Lecteur": public chapter pages route + authenticated /me/favorites, /me/reading-progress. */
@Module({
  imports: [
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-prod',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ReaderController, FavoritesController, ReadingProgressController],
  providers: [ReaderService, FavoritesService, ReadingProgressService, PrismaService, RedisService, SessionGuard],
})
export class ReaderModule {}
