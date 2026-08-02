import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 (RFC 9562 §5.7) — 48-bit big-endian unix-ms timestamp, then version/variant bits, then
 * random. Time-ordered, so primary-key inserts land at the right edge of the B-tree instead of
 * scattering the way a v4 does.
 *
 * Prisma's `@default(uuid(7))` covers every ordinary write; this exists for the two paths Prisma's
 * default cannot reach — the raw `INSERT … SELECT` in ChaptersService and the Media rows whose id is
 * needed to build the storage key BEFORE the row is created.
 *
 * ponytail: stdlib only — 12 lines beat a dependency, and `crypto.randomUUID` is v4-only.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = Date.now();
  // 48-bit timestamp, big-endian, in bytes 0..5.
  bytes.writeUIntBE(ms, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant (10xx)
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
