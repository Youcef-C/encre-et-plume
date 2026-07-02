import type { Job } from 'bullmq';
import {
  EmailProcessor,
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
} from './email.processor';
import type { EmailJob } from '@encre-et-plume/shared';
import type { EmailTransport } from '../../email/email-transport';
import type { MetricsService } from '../../observability/metrics.service';

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

// ── EmailProcessor — no-token-logging (existing assertions, kept) ─────────────

describe('EmailProcessor — no-token-logging assertions', () => {
  let processor: EmailProcessor;
  let logger: { log: jest.Mock; warn: jest.Mock };
  let mockTransport: { send: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    mockTransport = { send: jest.fn().mockResolvedValue(undefined) };
    processor = new EmailProcessor(mockTransport as unknown as EmailTransport);
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

// ── EmailProcessor — transport delivery + metrics ─────────────────────────────

describe('EmailProcessor — transport and metrics', () => {
  let processor: EmailProcessor;
  let mockTransport: { send: jest.Mock };
  let mockMetrics: { incEmailSent: jest.Mock; incEmailFailed: jest.Mock };

  beforeEach(() => {
    mockTransport = { send: jest.fn().mockResolvedValue(undefined) };
    mockMetrics = { incEmailSent: jest.fn(), incEmailFailed: jest.fn() };
    processor = new EmailProcessor(
      mockTransport as unknown as EmailTransport,
      mockMetrics as unknown as MetricsService,
    );
  });

  it('process() calls transport.send once with rendered subject, html, text', async () => {
    const job = { name: 'email_verification' } as unknown as Job;
    await processor.process(VERIFY_JOB, job);

    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    const sendArg = mockTransport.send.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(sendArg.to).toBe('yuki@test.com');
    expect(sendArg.subject).toContain('Encre & Plume');
    expect(sendArg.html).toContain('<html');
    expect(sendArg.text).toContain('Yuki Moreau');
  });

  it('success path calls metrics.incEmailSent with template name', async () => {
    const job = { name: 'email_verification' } as unknown as Job;
    await processor.process(VERIFY_JOB, job);

    expect(mockMetrics.incEmailSent).toHaveBeenCalledWith('email_verification');
    expect(mockMetrics.incEmailFailed).not.toHaveBeenCalled();
  });

  it('throwing transport rethrows and calls metrics.incEmailFailed', async () => {
    mockTransport.send.mockRejectedValue(new Error('SMTP down'));
    const job = { name: 'email_verification' } as unknown as Job;

    await expect(processor.process(VERIFY_JOB, job)).rejects.toThrow('SMTP down');
    expect(mockMetrics.incEmailFailed).toHaveBeenCalledWith('email_verification');
    expect(mockMetrics.incEmailSent).not.toHaveBeenCalled();
  });
});

// ── F-12: Password reset email templates ──────────────────────────────────────

const RESET_PARAMS = {
  resetUrl: 'http://localhost:3000/reinitialiser-mot-de-passe?token=secret-token-xyz',
  displayName: 'Yuki Moreau',
};

describe('renderPasswordResetEmail', () => {
  it('returns a French subject containing "Réinitialisation" and "Encre & Plume"', () => {
    const { subject } = renderPasswordResetEmail(RESET_PARAMS);
    expect(subject).toContain('Réinitialisation');
    expect(subject).toContain('Encre & Plume');
  });

  it('body contains the displayName', () => {
    const { text } = renderPasswordResetEmail(RESET_PARAMS);
    expect(text).toContain('Yuki Moreau');
  });

  it('body contains the resetUrl', () => {
    const { text } = renderPasswordResetEmail(RESET_PARAMS);
    expect(text).toContain(RESET_PARAMS.resetUrl);
  });

  it('body warns that the link expires in 1 hour', () => {
    const { text } = renderPasswordResetEmail(RESET_PARAMS);
    expect(text).toContain('1 heure');
  });

  it('body includes a "not you" reassurance line', () => {
    const { text } = renderPasswordResetEmail(RESET_PARAMS);
    expect(text.toLowerCase()).toContain('ignorez');
  });
});

describe('renderPasswordChangedEmail', () => {
  it('returns a French subject indicating password was changed and mentions "Encre & Plume"', () => {
    const { subject } = renderPasswordChangedEmail({ displayName: 'Yuki Moreau' });
    expect(subject).toContain('modifié');
    expect(subject).toContain('Encre & Plume');
  });

  it('body contains the displayName', () => {
    const { text } = renderPasswordChangedEmail({ displayName: 'Yuki Moreau' });
    expect(text).toContain('Yuki Moreau');
  });
});

describe('EmailProcessor — password_reset and password_changed dispatch', () => {
  let processor: EmailProcessor;
  let logger: { log: jest.Mock; warn: jest.Mock };
  let mockTransport: { send: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    mockTransport = { send: jest.fn().mockResolvedValue(undefined) };
    processor = new EmailProcessor(mockTransport as unknown as EmailTransport);
    (processor as unknown as { logger: typeof logger }).logger = logger;
  });

  const RESET_JOB: EmailJob = {
    to: 'yuki@test.com',
    template: 'password_reset',
    params: RESET_PARAMS,
  };

  const CHANGED_JOB: EmailJob = {
    to: 'yuki@test.com',
    template: 'password_changed',
    params: { displayName: 'Yuki Moreau' },
  };

  it('process() resolves for password_reset without throwing', async () => {
    const job = { name: 'password_reset' } as unknown as Job;
    await expect(processor.process(RESET_JOB, job)).resolves.toBeUndefined();
  });

  it('process() resolves for password_changed without throwing', async () => {
    const job = { name: 'password_changed' } as unknown as Job;
    await expect(processor.process(CHANGED_JOB, job)).resolves.toBeUndefined();
  });

  it('processor does NOT log resetUrl for password_reset (raw token is a credential)', async () => {
    const job = { name: 'password_reset' } as unknown as Job;
    await processor.process(RESET_JOB, job);

    const allLogs = (logger.log.mock.calls as [string][]).map(([msg]) => msg).join(' ');
    expect(allLogs).not.toContain('secret-token-xyz');
    expect(allLogs).not.toContain('reinitialiser-mot-de-passe');
  });

  it('processor logs recipient and template for password_reset', async () => {
    const job = { name: 'password_reset' } as unknown as Job;
    await processor.process(RESET_JOB, job);

    const allLogs = (logger.log.mock.calls as [string][]).map(([msg]) => msg).join(' ');
    expect(allLogs).toContain('yuki@test.com');
    expect(allLogs).toContain('password_reset');
  });
});
