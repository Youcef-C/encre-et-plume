// F-23 — cookieless audience measurement. No cookie, no storage, no third-party SDK.

/** What an `Event` row records. The browser may only ever emit `visit` (see TrackEventRequest). */
export const EVENT_KINDS = ['visit', 'read', 'signup', 'publish'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * `POST /events` request body — the ONLY thing the browser sends, and only for `visit`.
 * The server stamps `at`, `visitorId` and `accountId`; a client may never supply them (D-5).
 * `read` / `signup` / `publish` are emitted server-side where the write already happens, so they
 * are deliberately not reachable from this endpoint.
 */
export interface TrackEventRequest {
  kind: 'visit';
  /** Pathname only. The server strips any query string defensively. */
  path?: string;
  /** Full referrer; the server reduces it to its host and never stores more. */
  ref?: string;
}

/**
 * `DailyStat.metric` values written by the nightly rollup. Rates (conversion, interaction,
 * share-who-post) are NEVER stored — AD-7 / PE-5 compute them at read time from two series.
 */
export const DAILY_METRICS = [
  'visits',
  'uniques',
  'reads',
  'signups',
  'works',
  'chapters',
  'illustrations',
  'reviews',
  'accounts',
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

/** `Event` rows are pruned past this age (rolling window). */
export const EVENT_RETENTION_DAYS = 90;
/** `DailyStat` rows are kept this long — the privacy policy's 25-month cap. */
export const DAILY_STAT_RETENTION_MONTHS = 25;
