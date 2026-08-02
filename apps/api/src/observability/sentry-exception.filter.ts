import { Catch, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { isSentryEnabled } from './sentry';
import { getRequestId, requestContext } from './request-context';

/**
 * Every primary key is a native Postgres `uuid` since the UUIDv7 pass, so Prisma rejects a lookup by
 * a non-UUID string with P2023 ("Inconsistent column data") instead of returning `null`. A path param
 * that cannot be a UUID cannot name a row, so the honest answer is the 404 those routes returned while
 * ids were TEXT — not a 500, and not a Sentry alert. Narrowed to the UUID-parse message so a genuine
 * P2023 (malformed stored data) still surfaces as the bug it is.
 */
function isMalformedUuidLookup(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { message?: unknown } };
  return err?.code === 'P2023' && /uuid/i.test(String(err?.meta?.message ?? ''));
}

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    if (isMalformedUuidLookup(exception)) exception = new NotFoundException();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: 'Internal server error' };

    // Capture only 5xx / unhandled; 4xx are client errors (noise)
    if (status >= 500 && isSentryEnabled()) {
      Sentry.withScope((scope) => {
        const userId = requestContext.getStore()?.userId;
        const route = (req as { route?: { path?: string } }).route?.path ?? req.url;
        scope.setTag('route', route);
        if (userId) scope.setUser({ id: userId });
        scope.setContext('request', { requestId: getRequestId() });
        Sentry.captureException(exception);
      });
    }

    res.status(status).json(body);
  }
}
