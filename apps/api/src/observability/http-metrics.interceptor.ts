import { Injectable, Optional } from '@nestjs/common';
import type { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Global interceptor: records RED (rate/errors/duration) per matched route.
 * ponytail: uses req.route.path (matched pattern) not req.url so /users/123 doesn't explode label cardinality.
 * ponytail: /health* and /metrics excluded from their own counters to avoid self-referential noise.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(@Optional() private readonly metrics?: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const path = (req as { route?: { path?: string } }).route?.path ?? req.url;

    if (path.startsWith('/health') || path === '/metrics') {
      return next.handle();
    }

    const method = req.method;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const status = context.switchToHttp().getResponse<Response>().statusCode;
        this.metrics?.recordHttp(method, path, status, (Date.now() - start) / 1000);
      }),
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        this.metrics?.recordHttp(method, path, status, (Date.now() - start) / 1000);
        throw err;
      }),
    );
  }
}
