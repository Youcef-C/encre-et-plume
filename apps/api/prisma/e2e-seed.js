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
const { e2ePrisma } = require('./_e2e-prisma');
const bcrypt = require('bcryptjs');

const SPECS = [
  { key: 'UTILISATEUR', email: 'qa_e2e_utilisateur@test.com', slug: 'e2e-utilisateur' },
  { key: 'TARGET',      email: 'qa_e2e_target@test.com',      slug: 'e2e-target' },
  { key: 'ADMIN',       email: 'qa_e2e_admin@test.com',       slug: 'e2e-admin' },
  { key: 'EDITOR',      email: 'qa_e2e_editor@test.com',      slug: 'e2e-editor' },
  { key: 'ADMIN2',      email: 'qa_e2e_admin2@test.com',      slug: 'e2e-admin2' },
  { key: 'ADMIN3',      email: 'qa_e2e_admin3@test.com',      slug: 'e2e-admin3' },
  { key: 'FRESH',       email: 'qa_e2e_fresh@test.com',       slug: 'e2e-fresh' },
  // MC-9 dedicated messaging fixtures — no OTHER spec file references these, so parallel siblings
  // (notifications/profile/roles/media/onboarding/search, which all share UTILISATEUR/TARGET/ADMIN)
  // cannot mutate this suite's seeded unread counts or role state out from under it.
  { key: 'MSG_A',       email: 'qa_e2e_msg_a@test.com',       slug: 'e2e-msg-a' },
  { key: 'MSG_B',       email: 'qa_e2e_msg_b@test.com',       slug: 'e2e-msg-b' },
  { key: 'MSG_C',       email: 'qa_e2e_msg_c@test.com',       slug: 'e2e-msg-c' },
  { key: 'MSG_CONTACT', email: 'qa_e2e_msg_contact@test.com', slug: 'e2e-msg-contact' },
  { key: 'MSG_FRESH',   email: 'qa_e2e_msg_fresh@test.com',   slug: 'e2e-msg-fresh' },
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

  const prisma = e2ePrisma(5);
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
        onboardedAt: new Date(),     // F-17: seeded accounts are pre-onboarded so e2e suites don't get redirected
      },
      update: {
        passwordHash: hash,
        role: 'utilisateur',
        verified: false,
        emailVerifiedAt: new Date(), // F-11 R2: ensure existing seeded accounts are verified
        onboardedAt: new Date(),     // F-17: seeded accounts are pre-onboarded so e2e suites don't get redirected
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

  // ── MC-9: seed messaging fixtures for the dedicated MSG_A/MSG_B/MSG_C accounts ───────────────
  // Deterministic timestamps (ordering-stable). Reset first so each run is hermetic: delete every
  // conversation any seeded account participates in (cascade removes its participants + messages).
  // Dedicated (not UTILISATEUR/TARGET/ADMIN) so parallel siblings that log in as those shared
  // accounts can't touch this suite's unread-count fixtures.
  {
    const u = accounts.MSG_A.id;
    const t = accounts.MSG_B.id;
    const admin = accounts.MSG_C.id;
    const seededIds = Object.values(accounts).map((a) => a.id);

    const parts = await prisma.conversationParticipant.findMany({
      where: { accountId: { in: seededIds } },
      select: { conversationId: true },
    });
    const convIds = [...new Set(parts.map((p) => p.conversationId))];
    if (convIds.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
    }

    const D = (iso) => new Date(iso);
    // DM MSG_A ⇄ MSG_B — 2 messages from MSG_B after MSG_A's lastReadAt → 2 unread for MSG_A.
    const dmKey = [u, t].sort().join(':');
    await prisma.conversation.create({
      data: {
        type: 'dm',
        dmKey,
        lastMessageAt: D('2026-07-07T12:03:00.000Z'),
        participants: {
          create: [
            { accountId: u, lastReadAt: D('2026-07-07T12:01:00.000Z') },
            { accountId: t, lastReadAt: D('2026-07-07T12:03:00.000Z') },
          ],
        },
        messages: {
          create: [
            { senderId: u, body: 'Salut, tu es dispo cette semaine ?', createdAt: D('2026-07-07T12:01:00.000Z') },
            { senderId: t, body: 'Oui, avec plaisir.', createdAt: D('2026-07-07T12:02:00.000Z') },
            { senderId: t, body: 'On se cale un créneau demain ?', createdAt: D('2026-07-07T12:03:00.000Z') },
          ],
        },
      },
    });

    // Group "Projet · Lames de Brume" — 1 message from MSG_B, unread for MSG_A (preview row).
    await prisma.conversation.create({
      data: {
        type: 'group',
        name: 'Projet · Lames de Brume',
        lastMessageAt: D('2026-07-07T13:00:00.000Z'),
        participants: {
          create: [
            { accountId: u, lastReadAt: D('2026-07-07T11:00:00.000Z') },
            { accountId: t, lastReadAt: D('2026-07-07T13:00:00.000Z') },
            { accountId: admin, lastReadAt: D('2026-07-07T11:00:00.000Z') },
          ],
        },
        messages: {
          create: [{ senderId: t, body: 'nemu planche 4 prêt', createdAt: D('2026-07-07T13:00:00.000Z') }],
        },
      },
    });
  }

  await prisma.$disconnect();

  const fs = require('fs');
  fs.writeFileSync(outFile, JSON.stringify(accounts));
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
