import { Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATES } from '@encre-et-plume/shared';
import type { EmailTemplateKey, EmailDataByTemplate, EnqueueOptions } from '@encre-et-plume/shared';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class EmailService {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Validate → preference-check seam → enqueue on the `email` queue.
   * Rendering stays in EmailProcessor (keeps the job payload light — { to, template, params }).
   * ponytail: preference-check is always-send seam; F-15 wires the opted-out lookup.
   */
  async send<K extends EmailTemplateKey>(
    template: K,
    to: string,
    data: EmailDataByTemplate[K],
    opts?: Pick<EnqueueOptions, 'idempotencyKey'>,
  ): Promise<void> {
    const entry = EMAIL_TEMPLATES[template];
    if (!entry) {
      throw new Error(`Unknown email template: "${template as string}"`);
    }

    // ponytail: F-15 preference check seam — always send until F-15 wires opted-out lookup
    // if (!entry.mandatory && await preferencesService.isOptedOut(to, 'email')) return;

    await this.queueService.enqueue(
      'email',
      template,
      { to, template, params: data as unknown as Record<string, string> },
      opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
  }
}
