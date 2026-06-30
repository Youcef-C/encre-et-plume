import { Global, Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AppLoggerService } from './app-logger.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { SentryExceptionFilter } from './sentry-exception.filter';
import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Global()
@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    HealthService,
    AppLoggerService,
    MetricsService,
    PrismaService,
    RedisService,
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService, HealthService, AppLoggerService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
