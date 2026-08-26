import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../auth/jwt-secret';
import { CatalogController } from './catalog.controller';
import { SitemapController } from './sitemap.controller';
import { CatalogService } from './catalog.service';
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
  // F-24: SitemapController is public/guard-free; it lives here because the catalog module already
  // owns the public read surface and PrismaService.
  controllers: [CatalogController, SitemapController],
  providers: [CatalogService, PrismaService, RedisService, OptionalSessionGuard],
})
export class CatalogModule {}
