import { of, throwError } from 'rxjs';
import { HttpException } from '@nestjs/common';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

function makeContext(method: string, url: string, routePath: string, statusCode = 200) {
  const req = { method, url, route: { path: routePath } };
  const res = { statusCode };
  return {
    getType: () => 'http' as const,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as import('@nestjs/common').ExecutionContext;
}

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let mockMetrics: { recordHttp: jest.Mock };

  beforeEach(() => {
    mockMetrics = { recordHttp: jest.fn() };
    interceptor = new HttpMetricsInterceptor(mockMetrics as unknown as MetricsService);
  });

  it('calls recordHttp with method/route/status/duration on success', (done) => {
    const ctx = makeContext('GET', '/api/test', '/api/test', 200);
    const handler = { handle: () => of('response') };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        expect(mockMetrics.recordHttp).toHaveBeenCalledWith(
          'GET', '/api/test', 200, expect.any(Number),
        );
        done();
      },
    });
  });

  it('calls recordHttp with 500 on unhandled error', (done) => {
    const ctx = makeContext('POST', '/api/signup', '/api/signup', 500);
    const handler = { handle: () => throwError(() => new Error('boom')) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        expect(mockMetrics.recordHttp).toHaveBeenCalledWith(
          'POST', '/api/signup', 500, expect.any(Number),
        );
        done();
      },
    });
  });

  it('calls recordHttp with HttpException status on http error', (done) => {
    const ctx = makeContext('GET', '/api/notfound', '/api/notfound', 404);
    const err = new HttpException('not found', 404);
    const handler = { handle: () => throwError(() => err) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        expect(mockMetrics.recordHttp).toHaveBeenCalledWith(
          'GET', '/api/notfound', 404, expect.any(Number),
        );
        done();
      },
    });
  });

  it('skips /health paths from counters', (done) => {
    const ctx = makeContext('GET', '/health', '/health', 200);
    const handler = { handle: () => of('ok') };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        expect(mockMetrics.recordHttp).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('skips /metrics path from counters', (done) => {
    const ctx = makeContext('GET', '/metrics', '/metrics', 200);
    const handler = { handle: () => of('ok') };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        expect(mockMetrics.recordHttp).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('passes through non-http contexts without recording', (done) => {
    const ctx = {
      getType: () => 'ws' as const,
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as import('@nestjs/common').ExecutionContext;
    const handler = { handle: () => of('ws-data') };

    interceptor.intercept(ctx, handler).subscribe({
      next: (val) => {
        expect(val).toBe('ws-data');
        expect(mockMetrics.recordHttp).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
