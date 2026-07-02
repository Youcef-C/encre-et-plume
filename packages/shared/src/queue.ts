// Shared queue contracts for F-8 (background job queue & reliable processing).
import type { NotifType } from './notification.js';
import type { EmailTemplateKey } from './email.js';

export const QUEUE_NAMES = [
  'stripe-events',
  'payouts',
  'email',
  'notifications-fanout',
  'image-processing',
  'data-export',     // F-14: packages user data into a zip archive
  'account-erasure', // F-14: RGPD art. 17 erasure flow
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

// ── F-16: Email job (catalog grown from F-11/F-12) ───────────────────────────

/**
 * F-16: EmailTemplateKey is the catalog type.
 * Legacy alias kept so existing imports of EmailTemplate still compile.
 */
export type { EmailTemplateKey };
export type EmailTemplate = EmailTemplateKey;

/** Payload for the `email` queue. Rendered + delivered by EmailProcessor. */
export interface EmailJob {
  to: string;
  template: EmailTemplateKey;
  /** Template params (stringy wire payload; EmailService.send() takes typed data). */
  params: Record<string, string>;
  idempotencyKey?: string;
}

// F-14: job payload types
export interface DataExportJob {
  accountId: string;
  exportId: string;
}

export interface AccountErasureJob {
  accountId: string;
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
