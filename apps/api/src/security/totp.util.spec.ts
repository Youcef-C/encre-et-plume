/**
 * BE-1: TOTP / AES / backup-code crypto util — TDD spec.
 * RFC 6238 Appendix B vectors: secret ASCII "12345678901234567890" (SHA1, step=30s, digits=6).
 * The RFC publishes 8-digit codes; we compute 6-digit = 8-digit % 10^6.
 */
import {
  generateSecret,
  base32Encode,
  base32Decode,
  totp,
  verifyTotp,
  buildProvisioningUri,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
} from './totp.util';
import { createHash } from 'node:crypto';
import { TOTP_PERIOD, TOTP_DIGITS, TOTP_WINDOW } from '@encre-et-plume/shared';

// RFC 6238 Appendix B — SHA1 column — ASCII secret "12345678901234567890" (20 bytes), step=30, digits=8.
// We verify our 6-digit output = RFC 8-digit % 10^6.
// NOTE: the RFC table also has SHA-256 (key=32 bytes) and SHA-512 (key=64 bytes) columns with
// different 8-digit values; we only verify the SHA-1 column here.
// SHA-1 8-digit values (from RFC 6238 Appendix B, SHA1 column):
//   T=59          → 94287082
//   T=1111111109  → 07081804
//   T=1234567890  → 89005924  (SHA-256 column has 14050471; SHA-1 has 89005924)
//   T=2000000000  → 69279037  (SHA-256 column has 89005924; SHA-1 has 69279037)
const RFC_SECRET_ASCII = '12345678901234567890';
// T values (Unix seconds) and expected 6-digit codes (SHA1 8-digit % 1000000)
const RFC_VECTORS: Array<[number, string]> = [
  [59,          '287082'], // SHA1 8-digit 94287082 % 10^6
  [1111111109,  '081804'], // SHA1 8-digit 07081804 % 10^6
  [1234567890,  '005924'], // SHA1 8-digit 89005924 % 10^6
  [2000000000,  '279037'], // SHA1 8-digit 69279037 % 10^6
];

describe('base32 round-trip', () => {
  it('encodes and decodes 20 random bytes', () => {
    const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
    const buf = randomBytes(20);
    const encoded = base32Encode(buf);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(buf);
  });

  it('encodes the RFC secret correctly (no-padding)', () => {
    const encoded = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
});

describe('totp() — RFC 6238 Appendix B SHA1 vectors (digits=6)', () => {
  const secret = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

  for (const [timeSec, expected] of RFC_VECTORS) {
    it(`T=${timeSec} → ${expected}`, () => {
      const code = totp(secret, timeSec * 1000, TOTP_PERIOD);
      expect(code).toBe(expected);
    });
  }
});

describe('verifyTotp()', () => {
  const secret = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

  it('accepts the current counter', () => {
    const now = 59 * 1000;
    expect(verifyTotp(secret, '287082', now)).toBe(true);
  });

  it(`accepts counters within ±${TOTP_WINDOW} step`, () => {
    const now = 59 * 1000;
    // T=59 is counter=1; T=89 is counter=2 (one step ahead)
    const nextCode = totp(secret, (59 + TOTP_PERIOD) * 1000);
    expect(verifyTotp(secret, nextCode, now)).toBe(true);
    const prevCode = totp(secret, (59 - TOTP_PERIOD) * 1000);
    expect(verifyTotp(secret, prevCode, now)).toBe(true);
  });

  it(`rejects counters ±${TOTP_WINDOW + 1} steps away`, () => {
    const now = 59 * 1000;
    const farCode = totp(secret, (59 + (TOTP_WINDOW + 1) * TOTP_PERIOD) * 1000);
    expect(verifyTotp(secret, farCode, now)).toBe(false);
  });

  it('returns false for wrong code', () => {
    expect(verifyTotp(secret, '000000', 59 * 1000)).toBe(false);
  });
});

describe('generateSecret()', () => {
  it('returns a 32-char base32 string (20 bytes)', () => {
    const s = generateSecret();
    // 20 bytes → 32 base32 chars (no padding)
    expect(s).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(s)).toBe(true);
  });
});

describe('buildProvisioningUri()', () => {
  it('returns an otpauth://totp URI with the expected params', () => {
    const uri = buildProvisioningUri('user@test.com', 'JBSWY3DPEHPK3PXP');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain(`digits=${TOTP_DIGITS}`);
    expect(uri).toContain(`period=${TOTP_PERIOD}`);
  });
});

describe('AES-256-GCM round-trip', () => {
  it('encrypt then decrypt returns the original secret', () => {
    const plain = 'MYSECRETBASE32VALUE';
    const stored = encryptSecret(plain);
    expect(stored).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/); // iv:tag:ciphertext
    expect(decryptSecret(stored)).toBe(plain);
  });

  it('throws when ciphertext is tampered', () => {
    const stored = encryptSecret('original');
    const [iv, tag, ct] = stored.split(':');
    const tampered = `${iv}:${tag}:${Buffer.from('tampered').toString('base64')}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('generateBackupCodes()', () => {
  it('returns 10 unique plain codes and matching sha256 hashes', () => {
    const { plain, hashes } = generateBackupCodes();
    expect(plain).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    // All unique
    expect(new Set(plain).size).toBe(10);
    expect(new Set(hashes).size).toBe(10);
    // Each hash matches sha256(normalise(code))
    for (let i = 0; i < 10; i++) {
      const normalized = plain[i]!.replace(/-/g, '').toUpperCase();
      const expected = createHash('sha256').update(normalized).digest('hex');
      expect(hashes[i]).toBe(expected);
    }
    // Format: 8 hex chars formatted xxxx-xxxx
    for (const code of plain) {
      expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/i);
    }
  });
});
