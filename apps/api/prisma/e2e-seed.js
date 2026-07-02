'use strict';
/**
 * E2E seed — creates 7 test accounts and writes their { email, id } data as
 * JSON to stdout. Called by apps/web/e2e/global-setup.ts before each e2e run.
 *
 * Reads DATABASE_URL from process.env; uses @prisma/client from the api package.
 * Idempotent: upserts on email, resets password + role + verified on update.
 *
 * F-13: also seeds ConsentRecords (cgu + privacy at current version) for all
 * seeded accounts so needsCguReconsent === false and e2e auth flows are unblocked.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const SPECS = [
  { key: 'UTILISATEUR', email: 'qa_e2e_utilisateur@test.com', slug: 'e2e-utilisateur' },
  { key: 'TARGET',      email: 'qa_e2e_target@test.com',      slug: 'e2e-target' },
  { key: 'ADMIN',       email: 'qa_e2e_admin@test.com',       slug: 'e2e-admin' },
  { key: 'EDITOR',      email: 'qa_e2e_editor@test.com',      slug: 'e2e-editor' },
  { key: 'ADMIN2',      email: 'qa_e2e_admin2@test.com',      slug: 'e2e-admin2' },
  { key: 'ADMIN3',      email: 'qa_e2e_admin3@test.com',      slug: 'e2e-admin3' },
  { key: 'FRESH',       email: 'qa_e2e_fresh@test.com',       slug: 'e2e-fresh' },
];

async function main() {
  // argv[2] is the output file path (written by global-setup.ts to avoid stdout capture).
  const outFile = process.argv[2];
  if (!outFile) throw new Error('Usage: e2e-seed.js <output-json-path>');

  // Hermeticity: flush leftover rate-limit counters (rl:*) from earlier manual/dev runs —
  // stale keys 429 the auth flows even though the e2e webServer sets DISABLE_RATE_LIMIT.
  if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL);
    try {
      const keys = await redis.keys('rl:*');
      if (keys.length > 0) await redis.del(...keys);
    } finally {
      redis.disconnect();
    }
  }

  const prisma = new PrismaClient();
  // ponytail: cost 10 is standard; no need for lower in tests since this runs once
  const hash = bcrypt.hashSync('password123', 10);

  // F-13: read current cgu + privacy versions so consent rows use the right version
  const cguDoc = await prisma.legalDocument.findFirst({ where: { kind: 'cgu' }, orderBy: { publishedAt: 'desc' } });
  const privacyDoc = await prisma.legalDocument.findFirst({ where: { kind: 'privacy' }, orderBy: { publishedAt: 'desc' } });

  const accounts = {};
  for (const spec of SPECS) {
    const account = await prisma.account.upsert({
      where: { email: spec.email },
      create: {
        email: spec.email,
        displayName: `E2E ${spec.key}`,
        passwordHash: hash,
        profileSlug: spec.slug,
        role: 'utilisateur',
        verified: false,
        emailVerifiedAt: new Date(), // F-11 R2: seeded accounts must be loginable
      },
      update: {
        passwordHash: hash,
        role: 'utilisateur',
        verified: false,
        emailVerifiedAt: new Date(), // F-11 R2: ensure existing seeded accounts are verified
      },
    });
    accounts[spec.key] = { email: account.email, id: account.id };

    // F-13: ensure consent records exist so needsCguReconsent === false for seeded accounts.
    // Uses findFirst + conditional create (idempotent — no unique constraint on ConsentRecord).
    for (const [kind, doc] of [['cgu', cguDoc], ['privacy', privacyDoc]]) {
      if (!doc) continue;
      const existing = await prisma.consentRecord.findFirst({
        where: { accountId: account.id, document: kind, version: doc.version },
      });
      if (!existing) {
        await prisma.consentRecord.create({
          data: { accountId: account.id, document: kind, version: doc.version },
        });
      }
    }
  }

  await prisma.$disconnect();

  const fs = require('fs');
  fs.writeFileSync(outFile, JSON.stringify(accounts));
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
