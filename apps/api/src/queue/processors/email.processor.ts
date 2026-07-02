import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import type { EmailJob } from '@encre-et-plume/shared';
import { EMAIL_TEMPLATES } from '@encre-et-plume/shared';
import { EMAIL_TRANSPORT } from '../../email/email-transport';
import type { EmailTransport } from '../../email/email-transport';
import { createEmailTransport } from '../../email/email-transport';
import { renderEmail } from '../../email/templates/render';
import { MetricsService } from '../../observability/metrics.service';

// Re-export individual renderers so existing specs that import them from here still work.
export {
  renderVerificationEmail,
  renderPasswordResetEmail,
  renderPasswordChangedEmail,
} from '../../email/templates/render';

const EMAIL_FROM = process.env['EMAIL_FROM'] ?? 'Encre & Plume <no-reply@encre-et-plume.local>';

/**
 * Processor for the `email` queue (F-16).
 * Renders template → calls the injected transport (SMTP or log).
 * ponytail: @Optional() on transport + metrics so unit tests using `new EmailProcessor()`
 * still construct; falls back to env-selected transport (LogTransport in CI/test).
 */
@Injectable()
export class EmailProcessor implements JobProcessor<EmailJob> {
  readonly queue = 'email' as const;
  readonly concurrency = 5;

  // ponytail: public so test can inject a spy logger without private field access hacks
  logger = new Logger(EmailProcessor.name);

  private readonly transport: EmailTransport;

  constructor(
    @Optional() @Inject(EMAIL_TRANSPORT) transport?: EmailTransport,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    // Fall back to env-selected transport when DI doesn't provide one (unit tests)
    this.transport = transport ?? createEmailTransport();
  }

  async process(data: EmailJob, _job: Job): Promise<void> {
    const { subject, html, text } = renderEmail(data.template, data.params);

    // List-Unsubscribe seam: only for non-mandatory templates with a token
    // ponytail: F-15 wires the unsubscribeUrl param; Compte group is all mandatory → no header this round
    const entry = EMAIL_TEMPLATES[data.template];
    const headers: Record<string, string> = {};
    if (!entry?.mandatory && data.params['unsubscribeUrl']) {
      headers['List-Unsubscribe'] = `<${data.params['unsubscribeUrl']}>`;
    }

    try {
      await this.transport.send({
        to: data.to,
        from: EMAIL_FROM,
        subject,
        html,
        text,
        headers: Object.keys(headers).length ? headers : undefined,
      });
      // Log only non-sensitive fields — never verifyUrl/resetUrl or raw tokens
      this.logger.log(`email sent to ${data.to} template=${data.template} subject="${subject}"`);
      this.metrics?.incEmailSent(data.template);
    } catch (err: unknown) {
      this.metrics?.incEmailFailed(data.template);
      throw err;
    }
  }
}
