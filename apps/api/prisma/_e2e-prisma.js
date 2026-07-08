'use strict';
/**
 * Shared PrismaClient factory for the e2e helper/seed scripts.
 *
 * WHY: these one-shot scripts (e2e-set-role, e2e-add-portfolio, e2e-add-notifications,
 * e2e-create-notification-via-service) are invoked MANY times CONCURRENTLY under parallel Playwright
 * workers. A default PrismaClient opens a pool of (num_cpus*2+1) connections; N concurrent invocations
 * therefore exhaust Postgres `max_connections` (→ "too many clients already", dropped sockets, and
 * partially-applied seeds that surface as wrong seeded state). Force a small explicit pool per client.
 *
 * OVERRIDES any connection_limit already on DATABASE_URL: CI sets a modest limit for the long-lived
 * API/worker, but these transient scripts must stay far smaller than that so their × concurrency
 * doesn't blow the ceiling.
 */
const { PrismaClient } = require('@prisma/client');

function e2ePrisma(limit) {
  let url = process.env.DATABASE_URL || '';
  url = url
    .replace(/([?&])connection_limit=\d+/g, '$1')
    .replace(/([?&])pool_timeout=\d+/g, '$1')
    .replace(/&&+/g, '&')
    .replace(/[?&]$/, '');
  const sep = url.includes('?') ? '&' : '?';
  const capped = `${url}${sep}connection_limit=${limit}&pool_timeout=20`;
  return new PrismaClient({ datasources: { db: { url: capped } } });
}

module.exports = { e2ePrisma };
