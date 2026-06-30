import { requestContext } from './request-context';
import { AppLoggerService } from './app-logger.service';

describe('AppLoggerService', () => {
  let logger: AppLoggerService;
  let writeSpy: jest.SpyInstance;
  let capturedLines: string[];

  beforeEach(() => {
    logger = new AppLoggerService();
    capturedLines = [];
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      capturedLines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('emits a valid JSON line for log()', () => {
    logger.log('hello world', 'TestCtx');
    expect(capturedLines).toHaveLength(1);
    const parsed = JSON.parse(capturedLines[0]!.trim()) as Record<string, unknown>;
    expect(parsed['level']).toBe('log');
    expect(parsed['message']).toBe('hello world');
    expect(parsed['context']).toBe('TestCtx');
    expect(typeof parsed['ts']).toBe('string');
  });

  it('carries the requestId from requestContext.run()', (done) => {
    requestContext.run({ requestId: 'req-abc-123' }, () => {
      logger.log('inside context');
      const parsed = JSON.parse(capturedLines[0]!.trim()) as Record<string, unknown>;
      expect(parsed['requestId']).toBe('req-abc-123');
      done();
    });
  });

  it('has undefined requestId outside a context', () => {
    logger.log('outside context');
    const parsed = JSON.parse(capturedLines[0]!.trim()) as Record<string, unknown>;
    expect(parsed['requestId']).toBeUndefined();
  });

  it('includes stack for error()', () => {
    logger.error('boom', 'Error: some stack\n  at foo', 'Ctx');
    const parsed = JSON.parse(capturedLines[0]!.trim()) as Record<string, unknown>;
    expect(parsed['level']).toBe('error');
    expect(parsed['stack']).toBeDefined();
  });

  it('redacts sensitive keys from log messages', () => {
    logger.log({ password: 'secret', username: 'alice' }, 'Ctx');
    const parsed = JSON.parse(capturedLines[0]!.trim()) as Record<string, unknown>;
    const msg = parsed['message'] as Record<string, unknown>;
    expect(msg['password']).toBe('[REDACTED]');
    expect(msg['username']).toBe('alice');
  });
});
