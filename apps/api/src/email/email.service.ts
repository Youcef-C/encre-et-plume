import { Injectable } from '@nestjs/common';
import { EMAIL_TEMPLATES } from '@encre-et-plume/shared';
import type { EmailTemplateKey, EmailDataByTemplate, EnqueueOptions } from '@encre-et-plume/shared';
import { QueueService } from '../queue/queue.service';
import { NotificationPreferencesService } from '../preferences/preferences.service';

@Injectable()
export class EmailService {
  constructor(
    private readonly queueService: QueueService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  /**
   * Validate → preference-check → enqueue on the `email` queue.
   * Rendering stays in EmailProcessor (keeps the job payload light — { to, template, params }).
   * F-15: mandatory templates always send; non-mandatory are skipped when opted out.
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

    // F-15: skip non-mandatory emails when user opted out
    if (!entry.mandatory && !(await this.preferences.isEmailAllowedByAddress(to, entry.group))) {
      return;
    }

    await this.queueService.enqueue(
      'email',
      template,
      { to, template, params: data as unknown as Record<string, string> },
      opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
  }
}
