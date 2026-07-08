'use strict';
/**
 * E2E hermeticity — flush the viewer-agnostic Redis list caches (gallery/catalog/home/ranking:
 * `*.service.ts`'s `cached()` helper, TTL 60s) before seeding.
 *
 * WHY: those caches are keyed by the query shape only (e.g. `gallery:list:{"q":"…"}`), not by DB
 * generation. A spec whose fixtures reuse the same title/slug across repeated local re-runs (rerun
 * within the 60s TTL) can get served a STALE cached item carrying a PREVIOUS run's id — which then
 * fails a same-run per-viewer filter check (MC-10 hiddenContent()) because the id no longer matches
 * the freshly-seeded row. Found while QA'ing MC-10 round 2 (gallery mutual-hiding, e2e MC10-E13
 * flaked on back-to-back local reruns). Called by global-setup.ts before the seed script, same
 * pattern as the documented `rl:*` flush for rate-limit staleness.
 */
const Redis = require('ioredis');

async function main() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    for (const prefix of ['gallery:*', 'catalog:*', 'home:*', 'ranking:*']) {
      const keys = await redis.keys(prefix);
      if (keys.length > 0) await redis.del(keys);
    }
  } catch (err) {
    // fail-open: a cache-flush hiccup must never block the e2e run (mirrors the services' own
    // fail-open Redis reads).
    process.stderr.write(`[e2e-flush-list-cache] non-fatal: ${err}\n`);
  } finally {
    redis.disconnect();
  }
}

main();
