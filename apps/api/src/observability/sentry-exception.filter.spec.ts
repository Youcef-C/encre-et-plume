jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((cb: (scope: { setTag: jest.Mock; setUser: jest.Mock; setContext: jest.Mock }) => void) => {
    cb({ setTag: jest.fn(), setUser: jest.fn(), setContext: jest.fn() });
  }),
}));
jest.mock('./sentry', () => ({
  isSentryEnabled: jest.fn().mockReturnValue(true),
}));
jest.mock('./request-context', () => ({
  getRequestId: jest.fn().mockReturnValue('req-id-999'),
  requestContext: { getStore: jest.fn().mockReturnValue({ requestId: 'req-id-999', userId: 'user-1' }) },
}));

import { HttpException, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry-exception.filter';

const mockCaptureException = Sentry.captureException as jest.Mock;

function makeHost(method = 'GET', url = '/test', routePath = '/test') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method, url, route: { path: routePath } };
  const res = { status };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getType: () => 'http',
    json,
    status,
    res,
  };
}

describe('SentryExceptionFilter', () => {
  let filter: SentryExceptionFilter;

  beforeEach(() => {
    filter = new SentryExceptionFilter();
    mockCaptureException.mockClear();
  });

  it('returns 404 for NotFoundException and does NOT capture to Sentry', () => {
    const host = makeHost();
    filter.catch(new NotFoundException('not found'), host as unknown as import('@nestjs/common').ArgumentsHost);
    expect(host.res.status).toHaveBeenCalledWith(404);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('returns 500 for unknown error and captures to Sentry', () => {
    const host = makeHost();
    const err = new Error('something blew up');
    filter.catch(err, host as unknown as import('@nestjs/common').ArgumentsHost);
    expect(host.res.status).toHaveBeenCalledWith(500);
    expect(mockCaptureException).toHaveBeenCalledWith(err);
  });

  it('returns correct status body for HttpException', () => {
    const host = makeHost();
    filter.catch(new HttpException('custom error', 422), host as unknown as import('@nestjs/common').ArgumentsHost);
    expect(host.res.status).toHaveBeenCalledWith(422);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not capture 4xx client errors (below 500)', () => {
    const host = makeHost();
    filter.catch(new HttpException('forbidden', 403), host as unknown as import('@nestjs/common').ArgumentsHost);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
