import type { ApiError } from '@encre-et-plume/shared';

export const GENERIC_ERROR = 'Une erreur est survenue. Veuillez réessayer.';

/**
 * The French, user-facing message of a rejected API call — or the generic French fallback.
 *
 * Only a real `ApiError` (the JSON body `request()` throws, always `{ statusCode, message, error }`)
 * carries copy safe to render. A transport failure rejects with a `TypeError` whose message is the
 * browser's English string ("Failed to fetch"), which must never reach a `role="alert"`; keying on
 * `statusCode` is what tells the two apart (review N1).
 */
export function apiErrorMessage(e: unknown, fallback = GENERIC_ERROR): string {
  const err = e as Partial<ApiError> | null;
  return typeof err?.statusCode === 'number' && typeof err.message === 'string' && err.message.length > 0
    ? err.message
    : fallback;
}
