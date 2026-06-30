/**
 * F-9: deep-redact sensitive keys from any value.
 * One denylist shared by AppLoggerService AND Sentry beforeSend — no drift.
 */
const DENYLIST = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'email',
  'card',
  'cvc',
  'iban',
]);

export function redact(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return (value as unknown[]).map(redact);
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = DENYLIST.has(key.toLowerCase()) ? '[REDACTED]' : redact(val);
  }
  return result;
}
