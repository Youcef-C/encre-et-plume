// F-16: Transport selection tests — nodemailer mocked, no real SMTP.
jest.mock('nodemailer', () => ({
  default: {
    createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }) }),
  },
  createTransport: jest.fn().mockReturnValue({ sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }) }),
}));

import nodemailer from 'nodemailer';
import { createEmailTransport } from './email-transport';
import type { EmailMessage } from './email-transport';

const MSG: EmailMessage = {
  to: 'yuki@test.com',
  from: 'Encre & Plume <no-reply@encre-et-plume.local>',
  subject: 'Test email',
  html: '<p>Bonjour !</p>',
  text: 'Bonjour !',
};

function getSendMail(): jest.Mock {
  // Each call to createTransport returns a transporter; get sendMail from the last mock result
  const mock = nodemailer.createTransport as jest.Mock;
  const result = mock.mock.results[mock.mock.results.length - 1];
  return (result?.value as { sendMail: jest.Mock })?.sendMail;
}

describe('createEmailTransport — SMTP_HOST set', () => {
  beforeEach(() => {
    process.env['SMTP_HOST'] = 'localhost';
    process.env['SMTP_PORT'] = '1025';
    process.env['SMTP_SECURE'] = 'false';
    (nodemailer.createTransport as jest.Mock).mockClear();
    // Refresh sendMail mock
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
    });
  });

  afterEach(() => {
    delete process.env['SMTP_HOST'];
    delete process.env['SMTP_PORT'];
    delete process.env['SMTP_SECURE'];
    delete process.env['SMTP_USER'];
    delete process.env['SMTP_PASS'];
  });

  it('returns an SMTP transport (nodemailer.createTransport called)', () => {
    createEmailTransport();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false }),
    );
  });

  it('send() calls sendMail with from, to, subject, html, text', async () => {
    const transport = createEmailTransport();
    await transport.send(MSG);
    const sendMail = getSendMail();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MSG.from,
        to: MSG.to,
        subject: MSG.subject,
        html: MSG.html,
        text: MSG.text,
      }),
    );
  });

  it('does not set auth when SMTP_USER is absent', () => {
    delete process.env['SMTP_USER'];
    createEmailTransport();
    const callArg = (nodemailer.createTransport as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['auth']).toBeUndefined();
  });

  it('sets auth when SMTP_USER is present', () => {
    process.env['SMTP_USER'] = 'user@test.com';
    process.env['SMTP_PASS'] = 'secret';
    createEmailTransport();
    const callArg = (nodemailer.createTransport as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg['auth']).toEqual({ user: 'user@test.com', pass: 'secret' });
  });
});

describe('createEmailTransport — SMTP_HOST empty (log transport)', () => {
  beforeEach(() => {
    delete process.env['SMTP_HOST'];
    (nodemailer.createTransport as jest.Mock).mockClear();
  });

  it('does NOT call nodemailer.createTransport', () => {
    createEmailTransport();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('send() resolves without throwing', async () => {
    const transport = createEmailTransport();
    await expect(transport.send(MSG)).resolves.toBeUndefined();
  });

  it('LogTransport logs subject and recipient but NOT the HTML body or tokens', async () => {
    const transport = createEmailTransport();
    // ponytail: public logger on LogTransport, mirrors EmailProcessor pattern
    const mockLogger = { log: jest.fn() };
    (transport as unknown as { logger: typeof mockLogger }).logger = mockLogger;

    const sensitiveMsg: EmailMessage = {
      ...MSG,
      html: '<p>secret-token-abc123</p>',
      text: 'plain text with secret-token',
    };
    await transport.send(sensitiveMsg);

    const allLogs = (mockLogger.log.mock.calls as [string][]).map(([m]) => m).join(' ');
    expect(allLogs).toContain('yuki@test.com');
    expect(allLogs).toContain('Test email'); // subject
    expect(allLogs).not.toContain('secret-token-abc123');
    expect(allLogs).not.toContain('plain text');
    expect(allLogs).not.toContain('<p>');
  });
});
