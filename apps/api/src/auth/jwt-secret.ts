const DEV_DEFAULT = 'dev-secret-change-in-prod';
const MIN_PROD_SECRET_LENGTH = 32;

/**
 * C1: single source of truth for the session-JWT / TOTP-key-derivation secret.
 * Fails closed in production — never signs/encrypts with the well-known dev default.
 */
export function getJwtSecret(): string {
  const value = process.env['JWT_SECRET'];

  if (process.env['NODE_ENV'] === 'production') {
    if (!value || value.length < MIN_PROD_SECRET_LENGTH || value === DEV_DEFAULT) {
      throw new Error('JWT_SECRET must be set to a strong value in production');
    }
    return value;
  }

  return value ?? DEV_DEFAULT;
}
