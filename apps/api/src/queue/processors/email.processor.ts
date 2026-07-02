import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import type { EmailJob } from '@encre-et-plume/shared';

/** Pure render — no I/O, easily unit-testable. */
export function renderVerificationEmail(params: Record<string, string>): { subject: string; text: string } {
  return {
    subject: `Confirmez votre adresse e-mail — Encre & Plume`,
    text: [
      `Bonjour ${params['displayName'] ?? ''},`,
      ``,
      `Merci de vous être inscrit·e sur Encre & Plume.`,
      `Cliquez sur le lien ci-dessous pour confirmer votre adresse e-mail :`,
      ``,
      params['verifyUrl'] ?? '',
      ``,
      `Ce lien expire dans 24 heures.`,
      ``,
      `À bientôt,`,
      `L'équipe Encre & Plume`,
    ].join('\n'),
  };
}

/**
 * Processor for the `email` queue (F-11).
 * Transport = log no-op in dev/CI. F-16 swaps in the real provider behind this seam.
 * ponytail: log transport; F-16 swaps in the real provider behind this seam.
 */
@Injectable()
export class EmailProcessor implements JobProcessor<EmailJob> {
  readonly queue = 'email' as const;
  readonly concurrency = 5;

  // ponytail: public so test can inject a spy logger without private field access hacks
  logger = new Logger(EmailProcessor.name);

  async process(data: EmailJob, _job: Job): Promise<void> {
    const { subject } = renderVerificationEmail(data.params);
    // Log only non-sensitive fields — never verifyUrl or token
    this.logger.log(`email sent to ${data.to} template=${data.template} subject="${subject}"`);
  }
}
