import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

export const EMAIL_TRANSPORT = 'EMAIL_TRANSPORT';

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

// ── SMTP transport (nodemailer) ───────────────────────────────────────────────

class SmtpTransport implements EmailTransport {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor() {
    const host = process.env['SMTP_HOST']!;
    const port = Number(process.env['SMTP_PORT'] ?? 587);
    const secure = process.env['SMTP_SECURE'] === 'true';
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: msg.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: msg.headers,
    });
  }
}

// ── Log transport (CI / no-SMTP envs) ────────────────────────────────────────

class LogTransport implements EmailTransport {
  // ponytail: public so test can inject a spy logger without private field access hacks
  logger = new Logger('LogTransport');

  async send(msg: EmailMessage): Promise<void> {
    // Log only non-sensitive fields — never HTML body, URLs, or tokens
    this.logger.log(`email sent to ${msg.to} subject="${msg.subject}"`);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Reads process.env at call time:
 * - SMTP_HOST set  → SmtpTransport (nodemailer)
 * - SMTP_HOST empty → LogTransport (dev/CI log, current behavior)
 */
export function createEmailTransport(): EmailTransport {
  if (process.env['SMTP_HOST']) {
    return new SmtpTransport();
  }
  return new LogTransport();
}
