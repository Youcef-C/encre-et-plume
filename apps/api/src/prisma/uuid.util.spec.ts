import { uuidv7 } from './uuid.util';

describe('uuidv7', () => {
  it('produces a canonical UUID string with version 7 and the RFC 9562 variant', () => {
    const id = uuidv7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('encodes the current time in the leading 48 bits (big-endian, ms)', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const ms = parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('sorts lexicographically in generation order across milliseconds', async () => {
    const first = uuidv7();
    await new Promise((r) => setTimeout(r, 3));
    const second = uuidv7();
    expect(first < second).toBe(true);
  });

  it('does not collide within the same millisecond', () => {
    const batch = new Set(Array.from({ length: 5000 }, () => uuidv7()));
    expect(batch.size).toBe(5000);
  });
});
