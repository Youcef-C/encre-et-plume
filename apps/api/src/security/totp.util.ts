/**
 * BE-1: TOTP / AES-256-GCM / backup-code crypto utilities.
 * Stdlib only — no new dependency (node:crypto).
 * RFC 6238 TOTP (SHA1, step=30s, digits=6) + AES-256-GCM secret at rest + sha256 backup codes.
 * NEVER log the secret or codes (F-9 redact).
 */
import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { TOTP_PERIOD, TOTP_DIGITS, TOTP_WINDOW, TOTP_ISSUER, BACKUP_CODE_COUNT } from '@encre-et-plume/shared';
import { getJwtSecret } from '../auth/jwt-secret';

// ── Base32 (RFC 4648, no padding) ─────────────────────────────────────────────

const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, result = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += B32_ALPHA[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) result += B32_ALPHA[(value << (5 - bits)) & 0x1f];
  return result;
}

export function base32Decode(str: string): Buffer {
  const s = str.toUpperCase();
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of s) {
    const idx = B32_ALPHA.indexOf(char);
    if (idx === -1) continue; // skip padding/whitespace
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ── TOTP (RFC 6238 — HMAC-SHA1, configurable step + digits) ──────────────────

/** Compute HOTP(secret_base32, counter) with dynamic truncation, zero-padded to TOTP_DIGITS. */
function hotp(secretBase32: string, counter: bigint): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // Big-endian 64-bit counter
  buf.writeBigUInt64BE(counter);
  const hs = createHmac('sha1', key).update(buf).digest();
  const offset = hs[19]! & 0x0f;
  const code =
    (((hs[offset]! & 0x7f) << 24) |
      ((hs[offset + 1]! & 0xff) << 16) |
      ((hs[offset + 2]! & 0xff) << 8) |
      (hs[offset + 3]! & 0xff)) %
    Math.pow(10, TOTP_DIGITS);
  return String(code).padStart(TOTP_DIGITS, '0');
}

/** TOTP for the given wall-clock time in milliseconds (default = Date.now()). */
export function totp(secretBase32: string, forTime = Date.now(), step = TOTP_PERIOD): string {
  // Use BigInt arithmetic to avoid float64 precision loss with large timestamps.
  const counter = BigInt(Math.trunc(forTime)) / BigInt(step * 1000);
  return hotp(secretBase32, counter);
}

/** Constant-time string compare (both must be same length; returns false if not). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Verify a TOTP code within ±TOTP_WINDOW steps of the given time.
 * Constant-time compare to prevent timing attacks.
 */
export function verifyTotp(secretBase32: string, code: string, forTime = Date.now()): boolean {
  const counter = BigInt(Math.floor(forTime / 1000 / TOTP_PERIOD));
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const expected = hotp(secretBase32, counter + BigInt(delta));
    if (safeEqual(expected, code)) return true;
  }
  return false;
}

/** Build an otpauth://totp URI for QR code generation. */
export function buildProvisioningUri(email: string, secret: string): string {
  const issuer = encodeURIComponent(TOTP_ISSUER);
  const encodedEmail = encodeURIComponent(email);
  return (
    `otpauth://totp/${issuer}:${encodedEmail}` +
    `?secret=${secret}` +
    `&issuer=${issuer}` +
    `&algorithm=SHA1` +
    `&digits=${TOTP_DIGITS}` +
    `&period=${TOTP_PERIOD}`
  );
}

// ── AES-256-GCM secret at rest ────────────────────────────────────────────────

/** Derive the AES key from env or fall back to scrypt(JWT_SECRET, 'ep-2fa', 32). */
function getEncKey(): Buffer {
  const envKey = process.env['TWO_FACTOR_ENC_KEY'];
  if (envKey) return Buffer.from(envKey, 'base64');
  // ponytail: fallback so dev/CI needs no extra env var; scrypt with salt ensures 32 bytes
  return scryptSync(getJwtSecret(), 'ep-2fa', 32);
}

/** Encrypt a TOTP secret (base32 string) for DB storage. Format: base64(iv):base64(tag):base64(ct). */
export function encryptSecret(plain: string): string {
  const key = getEncKey();
  const iv = randomBytes(12); // GCM standard iv length
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a stored TOTP secret. Throws if authentication tag fails (tampered). */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, ctB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Invalid encrypted secret format');
  const key = getEncKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Backup codes ──────────────────────────────────────────────────────────────

/** Generate BACKUP_CODE_COUNT single-use backup codes + their sha256 hashes. */
export function generateBackupCodes(): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = randomBytes(4).toString('hex'); // 8 hex chars
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4)}`; // xxxx-xxxx
    const normalized = raw.toUpperCase(); // strip dash, uppercase for hash
    plain.push(formatted);
    hashes.push(createHash('sha256').update(normalized).digest('hex'));
  }
  return { plain, hashes };
}

/** Hash a backup code for comparison (strips dashes, uppercase). */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
}

/** Generate a random secret (20 bytes → 32-char base32, no padding). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}
