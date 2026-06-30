import type { Job } from 'bullmq';
import type { QueueName } from '@encre-et-plume/shared';

export const QUEUE_PROCESSORS = Symbol('QUEUE_PROCESSORS');

/** Contract WorkerRunner consumes; each processor implements it. Keeps queue wiring out of feature code. */
export interface JobProcessor<T = unknown> {
  readonly queue: QueueName;
  /** BullMQ Worker concurrency. Default 5. */
  readonly concurrency?: number;
  process(data: T, job: Job): Promise<void>;
}
