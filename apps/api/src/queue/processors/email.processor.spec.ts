import type { Job } from 'bullmq';
import { EmailProcessor, renderVerificationEmail } from './email.processor';
import type { EmailJob } from '@encre-et-plume/shared';

const VERIFY_JOB: EmailJob = {
  to: 'yuki@test.com',
  template: 'email_verification',
  params: {
    verifyUrl: 'http://localhost:3000/verifier-email?token=abc123',
    displayName: 'Yuki Moreau',
  },
};

describe('renderVerificationEmail', () => {
  it('returns a French subject containing the platform name', () => {
    const { subject } = renderVerificationEmail(VERIFY_JOB.params);
    expect(subject).toContain('Encre & Plume');
    expect(subject).toContain('Confirmez');
  });

  it('body contains verifyUrl', () => {
    const { text } = renderVerificationEmail(VERIFY_JOB.params);
    expect(text).toContain('http://localhost:3000/verifier-email?token=abc123');
  });

  it('body contains displayName', () => {
    const { text } = renderVerificationEmail(VERIFY_JOB.params);
    expect(text).toContain('Yuki Moreau');
  });
});

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let logger: { log: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    processor = new EmailProcessor();
    // Inject the test logger to capture output without stdout noise
    (processor as unknown as { logger: typeof logger }).logger = logger;
  });

  it('has queue = "email"', () => {
    expect(processor.queue).toBe('email');
  });

  it('process() resolves without throwing', async () => {
    const job = { name: 'email_verification' } as unknown as Job;
    await expect(processor.process(VERIFY_JOB, job)).resolves.toBeUndefined();
  });

  it('logs to → template but does NOT log the raw token (verifyUrl)', async () => {
    const job = { name: 'email_verification' } as unknown as Job;
    await processor.process(VERIFY_JOB, job);

    const allLogs = (logger.log.mock.calls as [string][]).map(([msg]) => msg).join(' ');
    // Must log recipient and template
    expect(allLogs).toContain('yuki@test.com');
    expect(allLogs).toContain('email_verification');
    // Must NOT log the verifyUrl/token (security: raw token is a credential)
    expect(allLogs).not.toContain('abc123');
    expect(allLogs).not.toContain('verifier-email');
  });
});
