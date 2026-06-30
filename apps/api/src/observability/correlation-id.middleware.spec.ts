import { CorrelationIdMiddleware } from './correlation-id.middleware';
import { getRequestId } from './request-context';

function makeReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as import('express').Request;
  const resHeaders: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => { resHeaders[k] = v; },
    _headers: resHeaders,
  } as unknown as import('express').Response;
  return { req, res, resHeaders };
}

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('uses inbound x-request-id header when present', (done) => {
    const { req, res } = makeReqRes({ 'x-request-id': 'my-request-id' });
    middleware.use(req, res, () => {
      expect(getRequestId()).toBe('my-request-id');
      done();
    });
  });

  it('generates a UUID when x-request-id is absent', (done) => {
    const { req, res, resHeaders } = makeReqRes();
    middleware.use(req, res, () => {
      const id = getRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(resHeaders['x-request-id']).toBe(id);
      done();
    });
  });

  it('sets the x-request-id response header', (done) => {
    const { req, res, resHeaders } = makeReqRes({ 'x-request-id': 'hdr-123' });
    middleware.use(req, res, () => {
      expect(resHeaders['x-request-id']).toBe('hdr-123');
      done();
    });
  });

  it('gives each request a different id when none supplied', (done) => {
    const { req: req1, res: res1 } = makeReqRes();
    const { req: req2, res: res2 } = makeReqRes();
    let id1: string | undefined;
    middleware.use(req1, res1, () => {
      id1 = getRequestId();
      middleware.use(req2, res2, () => {
        const id2 = getRequestId();
        expect(id1).not.toBe(id2);
        done();
      });
    });
  });
});
