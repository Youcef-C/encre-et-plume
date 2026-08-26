import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * F-26 B5/V1 — the only thing that stops a sixth Redis client shipping with the wrong options.
 *
 * F-23 took three review rounds and two of them were the same bug: a client constructed without
 * `enableOfflineQueue: false` / `commandTimeout`, so during an outage commands QUEUED instead of
 * rejecting and the caller hung forever. Three sites, three different correct profiles, one of them
 * the inverse of the others — that is not a rule anyone holds in their head. It is a factory, and a
 * factory nobody is forced to use is a convention. Conventions lost three times already.
 *
 * D-2: `*.spec.ts` is exempt on purpose. `messaging/redis-io.adapter.spec.ts` constructs a raw
 * client with the exact broken 04c7b67 options to reproduce the shipped bug, and
 * `queue.integration.spec.ts` / `queue.service.spec.ts` use raw clients as probes. Guarding specs
 * would delete the regression tests this story exists to protect.
 */
const SRC_ROOT = join(__dirname, '..');
const FACTORY = join(SRC_ROOT, 'redis', 'redis-client.factory.ts');
const BARE_CONSTRUCTION = /new\s+(?:Redis|IORedis)\s*\(/;

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFilesUnder(full);
    if (!entry.name.endsWith('.ts')) return [];
    if (entry.name.endsWith('.spec.ts')) return []; // D-2
    if (full === FACTORY) return []; // the one place allowed to construct
    return [full];
  });
}

describe('Redis client factory guard (F-26 B5)', () => {
  it('has no bare `new Redis(` anywhere in apps/api/src outside the factory', () => {
    const offenders = tsFilesUnder(SRC_ROOT)
      .map((file) => {
        const hit = readFileSync(file, 'utf8')
          .split('\n')
          .findIndex((line) => BARE_CONSTRUCTION.test(line));
        return hit === -1 ? null : `${file.slice(SRC_ROOT.length + 1)}:${hit + 1}`;
      })
      .filter((v): v is string => v !== null);

    expect(offenders).toEqual([]);
    // If this failed: build the client through `createRedisClient('command' | 'pubsub')` from
    // src/redis/redis-client.factory.ts (or `bullmqConnectionOpts()` for a BullMQ connection).
    // A new profile belongs in that file's PROFILES table, with the reason it differs — never
    // as a fifth set of hand-written options.
  });

  it('walks a meaningful number of files (the walker itself is not silently empty)', () => {
    expect(tsFilesUnder(SRC_ROOT).length).toBeGreaterThan(50);
  });
});
