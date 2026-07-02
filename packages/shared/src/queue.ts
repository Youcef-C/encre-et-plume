// Shared queue contracts for F-8 (background job queue & reliable processing).
import type { NotifType } from './notification.js';

export const QUEUE_NAMES = [
  'stripe-events',
  'payouts',
  'email',
  'notifications-fanout',
  'image-processing',
] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Dead-letter queue name — permanent failures land here, never silently dropped. */
export const DEAD_LETTER_QUEUE = 'dead-letter';

export interface EnqueueOptions {
  /** Dedup key: re-enqueue with the same key is a no-op; re-delivered succeeded job = skip. */
  idempotencyKey?: string;
  /** Max attempts including the first. Default 3. */
  attempts?: number;
  /** Exponential backoff base in ms. Default 1000. */
  backoffMs?: number;
  /** Initial delay before first run, ms. */
  delayMs?: number;
}

/** Payload for the `notifications-fanout` queue — mirrors NotificationsService.create() input. */
export interface NotificationsFanoutJob {
  recipientId: string;
  type: NotifType;
  refId?: string | null;
  sourceUserId?: string | null;
  /** Caller-supplied idempotency key (also passed as EnqueueOptions.idempotencyKey). */
  idempotencyKey?: string;
}

// ── F-11: Email job (F-16 will grow EmailTemplate into a catalog) ─────────────

/** F-11: transactional e-mail templates. F-16 will grow this union into a catalog. */
export type EmailTemplate = 'email_verification';

/** Payload for the `email` queue. Rendered + delivered by EmailProcessor. */
export interface EmailJob {
  to: string;
  template: EmailTemplate;
  /** Template params (verification: { verifyUrl, displayName }). */
  params: Record<string, string>;
  idempotencyKey?: string;
}

export interface QueueHealthCounts {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueHealthResponse {
  queues: QueueHealthCounts[];
  /** Permanent-failure (dead-letter) backlog count. */
  deadLetter: number;
  /** ISO 8601 timestamp. */
  generatedAt: string;
}
