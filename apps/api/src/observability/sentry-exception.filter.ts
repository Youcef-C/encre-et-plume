import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { isSentryEnabled } from './sentry';
import { getRequestId, requestContext } from './request-context';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

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
