import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationsService } from '../../notifications/notifications.service';
import type { JobProcessor } from '../job-processor';
import type { NotificationsFanoutJob } from '@encre-et-plume/shared';

/**
 * The demonstrable end-to-end processor that proves the worker shares real modules.
 * Reuses NotificationsService.create() — additive, F-5 sync callers are unchanged.
 * Future multi-recipient emitters (MC-9 etc.) enqueue to notifications-fanout instead
 * of calling create() inline.
 */
@Injectable()
export class NotificationsFanoutProcessor implements JobProcessor<NotificationsFanoutJob> {
  readonly queue = 'notifications-fanout' as const;
  readonly concurrency = 5;

  constructor(private readonly notifications: NotificationsService) {}

  async process(data: NotificationsFanoutJob, _job: Job): Promise<void> {
    await this.notifications.create({
      recipientId: data.recipientId,
      type: data.type,
      refId: data.refId,
      sourceUserId: data.sourceUserId,
    });
  }
}
