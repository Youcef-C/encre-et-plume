import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, PrismaService, RedisService],
})
export class CatalogModule {}
