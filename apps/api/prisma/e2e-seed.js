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

/**
 * Fixed fixture ids — same convention as `seed.js` (group 05 is this file's range). Primary keys are
 * native Postgres `uuid` columns, which reject the readable strings these fixtures used to carry;
 * the map is keyed by the OLD readable name so `grep e2e-cs13-illu-main` still lands here.
 */
const FID = {
  'e2e-inv-project-a': '00000000-0000-7000-8000-000000000501',
  'e2e-cs12-proj-cours': '00000000-0000-7000-8000-000000000511',
  'e2e-cs12-proj-revision': '00000000-0000-7000-8000-000000000512',
  'e2e-cs12-proj-pause': '00000000-0000-7000-8000-000000000513',
  'e2e-cs12-proj-publie': '00000000-0000-7000-8000-000000000514',
  'e2e-cs12-illu-1': '00000000-0000-7000-8000-000000000515',
  'e2e-cs12-illu-2': '00000000-0000-7000-8000-000000000516',
  'e2e-cs12-illu-3': '00000000-0000-7000-8000-000000000517',
  'e2e-cs13-illu-main': '00000000-0000-7000-8000-000000000521',
  'e2e-cs13-illu-2': '00000000-0000-7000-8000-000000000522',
  'e2e-cs13-illu-3': '00000000-0000-7000-8000-000000000523',
  'e2e-cs13-illu-4': '00000000-0000-7000-8000-000000000524',
  'e2e-cs13-illu-5': '00000000-0000-7000-8000-000000000525',
  'e2e-cs13-illu-6': '00000000-0000-7000-8000-000000000526',
  'e2e-cs13-illu-7': '00000000-0000-7000-8000-000000000527',
  'e2e-f3-stale-role-call': '00000000-0000-7000-8000-000000000531',
};

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
  // MC-10 dedicated block/mute fixtures — no other spec file references these, so this suite's
  // absolute connection/DM/block-list assertions can't be disturbed by a parallel sibling.
  { key: 'MC10_A',      email: 'qa_e2e_mc10_a@test.com',      slug: 'e2e-mc10-a' },
  { key: 'MC10_B',      email: 'qa_e2e_mc10_b@test.com',      slug: 'e2e-mc10-b' },
  { key: 'MC10_FRESH',  email: 'qa_e2e_mc10_fresh@test.com',  slug: 'e2e-mc10-fresh' },
  // MC-3 dedicated invitations-inbox fixtures — no other spec file references these, so the inbox's
  // absolute status/filter/count assertions can't be disturbed by a parallel sibling responding.
  { key: 'INV_INBOX',   email: 'qa_e2e_inv_inbox@test.com',   slug: 'e2e-inv-inbox' },
  { key: 'INV_FROM_A',  email: 'qa_e2e_inv_from_a@test.com',  slug: 'e2e-inv-from-a' }, // dessinateur → invites to "écrire"
  { key: 'INV_FROM_B',  email: 'qa_e2e_inv_from_b@test.com',  slug: 'e2e-inv-from-b' }, // scenariste → invites to "dessiner"
  // CS-12 "Mes projets" dashboard fixtures — a dedicated creator who owns 4 projects (one per status)
  // + one illustration collection, with a collaborator on the "en cours" project. No other spec touches
  // these, so the dashboard's absolute status/count/member assertions can't be raced by a sibling.
  { key: 'CS12_OWNER',  email: 'qa_e2e_cs12_owner@test.com',  slug: 'e2e-cs12-owner' },  // scenariste (owner)
  { key: 'CS12_COLLAB', email: 'qa_e2e_cs12_collab@test.com', slug: 'e2e-cs12-collab' }, // dessinateur (accepted collaborator)
  // CS-13 "Modifier une illustration" fixtures — a dedicated artist who owns 5 published
  // illustrations (one is the edit target; the other 4 exercise the "Plus de cet·te artiste" cap +
  // the "Voir tout" -> /galerie?artist= facet) and a stranger account for the non-owner/404 gating test.
  { key: 'CS13_OWNER',    email: 'qa_e2e_cs13_owner@test.com',    slug: 'e2e-cs13-owner' },    // dessinateur (owner)
  { key: 'CS13_STRANGER', email: 'qa_e2e_cs13_stranger@test.com', slug: 'e2e-cs13-stranger' }, // signed-in non-owner
  // MC-12 dedicated group-management fixtures — no other spec file references these, so this
  // suite's absolute member-count/createdBy-transfer assertions can't be disturbed by a sibling.
  { key: 'MC12_A', email: 'qa_e2e_mc12_a@test.com', slug: 'e2e-mc12-a' }, // group creator
  { key: 'MC12_B', email: 'qa_e2e_mc12_b@test.com', slug: 'e2e-mc12-b' }, // earliest-joined member (ownership transfer target)
  { key: 'MC12_C', email: 'qa_e2e_mc12_c@test.com', slug: 'e2e-mc12-c' }, // kicked member
  { key: 'MC12_D', email: 'qa_e2e_mc12_d@test.com', slug: 'e2e-mc12-d' }, // added-later member
  // F-3 (2026-07-10 bug-fix batch) — dedicated fixture reproducing the legacy stale-role save bug
  // out of the box: a Profile with seekingActive:true + the legacy INVALID seekingTargetRole
  // ('dessinateur' isn't in SEEKING_TARGET_ROLES, only 'dessinateur·rice' is) plus an ACCEPTED
  // application. No other spec file references this account.
  { key: 'F3_STALE_ROLE', email: 'qa_e2e_f3_stale_role@test.com', slug: 'e2e-f3-stale-role' },
  // MC-5/MC-6 batch (2026-07-10) — dedicated APPLICANT fixture for calls-batch-fixes.spec.ts's
  // portfolio-pick apply/edit flows (Items 1 and 3+6). Not shared with any other spec file — this
  // replaces reusing the shared camille/dr1-camille-roux account, which left residual applications
  // on seed.js's shared calls and broke mc5-apply-call.spec.ts's MC5-E7/E8 (a real CI regression).
  // No ProjectCall is seeded here on purpose: the calls-batch spec creates its own throwaway call per
  // test (owned by a fresh live-signup account, deleted at test end) so it never permanently inflates
  // the board's total open-call count that appels.spec.ts asserts exactly (e.g. "10 total").
  { key: 'MC_BATCH_SCENARISTE', email: 'qa_e2e_mc_batch_scenariste@test.com', slug: 'e2e-mc-batch-scenariste' },
  // CS-10 dedicated "Gérer le groupe" fixtures (QA) — a lone-owner project (A) plus an already-
  // connected contact (B) so the InviteModal's picker (D5: no `recipient`/`fromWork` prop → contacts
  // pool) can invite B without a separate connection-request flow. No other spec references these
  // accounts or the project, so revoke/role/split mutations here can't disturb a parallel sibling.
  { key: 'CS10_A', email: 'qa_e2e_cs10_a@test.com', slug: 'e2e-cs10-a' }, // scenariste (owner/leader)
  { key: 'CS10_B', email: 'qa_e2e_cs10_b@test.com', slug: 'e2e-cs10-b' }, // dessinateur (invitee)
  // Round 2 (B8-R2): a third contact, connected to B, so the CS10-E15 probe can watch a promoted
  // CO-LEADER send a project invitation (the gate that used to 403 every non-owner).
  { key: 'CS10_C', email: 'qa_e2e_cs10_c@test.com', slug: 'e2e-cs10-c' }, // scenariste (B's contact)
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

  // ── MC-10: block & mute fixtures for the dedicated MC10_A/MC10_B/MC10_FRESH accounts ──────────
  // A and B start as accepted contacts with an existing DM (so B can attempt a send after A blocks
  // them, and the block-triggered auto-remove-connection criterion has something to remove). Reset
  // first so re-runs are hermetic: previous local runs may have left a block/connection/DM behind.
  {
    const a = accounts.MC10_A.id;
    const b = accounts.MC10_B.id;
    const fresh = accounts.MC10_FRESH.id;

    await prisma.userBlock.deleteMany({
      where: { OR: [{ blockerId: { in: [a, b, fresh] } }, { blockedId: { in: [a, b, fresh] } }] },
    });
    await prisma.connection.deleteMany({
      where: { requesterId: { in: [a, b] }, addresseeId: { in: [a, b] } },
    });
    const mc10Parts = await prisma.conversationParticipant.findMany({
      where: { accountId: { in: [a, b] } },
      select: { conversationId: true },
    });
    const mc10ConvIds = [...new Set(mc10Parts.map((p) => p.conversationId))];
    if (mc10ConvIds.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: mc10ConvIds } } });
    }

    // Clear any mute A/MC10_FRESH left on the dev-seeded review author (dr1-yuki-moreau, the
    // lames-de-brume review fixture) from a prior local run — kept hermetic across re-runs.
    const yuki = await prisma.account.findUnique({ where: { profileSlug: 'dr1-yuki-moreau' } });
    if (yuki) {
      await prisma.userBlock.deleteMany({ where: { blockerId: { in: [a, fresh] }, blockedId: yuki.id } });
    }

    await prisma.connection.create({
      data: { requesterId: a, addresseeId: b, status: 'accepted', respondedAt: new Date('2026-07-08T09:00:00.000Z') },
    });
    const dmKey = [a, b].sort().join(':');
    await prisma.conversation.create({
      data: {
        type: 'dm',
        dmKey,
        lastMessageAt: new Date('2026-07-08T10:00:00.000Z'),
        participants: {
          create: [
            { accountId: a, lastReadAt: new Date('2026-07-08T10:00:00.000Z') },
            { accountId: b, lastReadAt: new Date('2026-07-08T10:00:00.000Z') },
          ],
        },
        messages: {
          create: [{ senderId: a, body: 'Salut, on garde le contact !', createdAt: new Date('2026-07-08T10:00:00.000Z') }],
        },
      },
    });

    // Round 2 (B14): MC10_A owns one published work + one published illustration so the mutual
    // content-hiding criterion (R2-B2/B3) is assertable from B's session and from an anonymous
    // context. Idempotent (work upsert by slug; illustration reset-then-create by title).
    const workA = await prisma.work.upsert({
      where: { slug: 'e2e-mc10-oeuvre-a' },
      update: { publishedAt: new Date('2026-07-08T08:00:00.000Z') },
      create: {
        slug: 'e2e-mc10-oeuvre-a',
        title: 'E2E MC10 Œuvre A',
        genre: 'Seinen',
        format: 'Manga',
        audienceRating: 'Tous publics',
        publishedAt: new Date('2026-07-08T08:00:00.000Z'),
      },
    });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: workA.id, accountId: a } },
      update: {},
      create: { workId: workA.id, accountId: a, role: 'dessinateur', order: 0 },
    });

    await prisma.illustration.deleteMany({ where: { title: 'E2E MC10 Illustration A' } });
    await prisma.illustration.create({
      data: {
        title: 'E2E MC10 Illustration A',
        artistId: a,
        artistName: 'E2E MC10_A',
        category: 'personnages',
        publishedAt: new Date('2026-07-08T08:00:00.000Z'),
      },
    });
  }

  // ── BE-RT1 (mc9-messaging.spec.ts realtime notifications): ADMIN2 → ADMIN3 and ADMIN3 →
  // MSG_FRESH each need a FRESH (201) connection request every run. Reset first — a prior local
  // run's request otherwise lingers as 'pending' and the next run's POST 409s (QA finding).
  {
    const admin2 = accounts.ADMIN2.id;
    const admin3 = accounts.ADMIN3.id;
    const msgFresh = accounts.MSG_FRESH.id;
    await prisma.connection.deleteMany({
      where: {
        OR: [
          { requesterId: admin2, addresseeId: admin3 },
          { requesterId: admin3, addresseeId: admin2 },
          { requesterId: admin3, addresseeId: msgFresh },
          { requesterId: msgFresh, addresseeId: admin3 },
        ],
      },
    });
  }

  // ── MC-3: invitations-inbox fixtures for the dedicated INV_INBOX account ──────────────────────
  // INV_INBOX receives collab invitations across every status from two inviters with fixed creator
  // roles (A dessinateur → "écrire", B scenariste → "dessiner"). Hermetic: wipe INV_INBOX's received
  // invitations + notifications first. One invitation notification proves the /invitations href fix.
  {
    const inbox = accounts.INV_INBOX.id;
    const fromA = accounts.INV_FROM_A.id; // dessinateur
    const fromB = accounts.INV_FROM_B.id; // scenariste

    // Inviter profiles must carry creatorRoles[0] so the DTO's from.role (→ verb) resolves.
    for (const [id, role] of [[fromA, 'dessinateur'], [fromB, 'scenariste']]) {
      await prisma.profile.upsert({
        where: { accountId: id },
        update: { creatorRoles: [role] },
        create: { accountId: id, creatorRoles: [role] },
      });
    }

    await prisma.invitation.deleteMany({ where: { toUserId: inbox } });
    await prisma.notification.deleteMany({ where: { recipientId: inbox } });

    // A project owned by inviter A so the "Ouvrir" action on the accepted row has a target.
    // `Project.workId` is NOT NULL, so the Work half is seeded first (upsert-by-slug: re-runnable).
    const invWork = await prisma.work.upsert({
      where: { slug: 'e2e-inv-project-a' },
      create: { slug: 'e2e-inv-project-a', title: 'Onibi — arc 2', genre: 'Seinen' },
      update: {},
    });
    // Seed-coherence pass: every project's owner is a real WorkCreator, so the œuvre/creator block
    // is never empty and the group model (CS-10) resolves — the same row projects.service writes.
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: invWork.id, accountId: fromA } },
      create: { workId: invWork.id, accountId: fromA, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader' },
    });
    const projData = { ownerId: fromA, title: 'Onibi — arc 2', kind: 'Manga', genre: 'Seinen', status: 'en cours', workId: invWork.id };
    const proj = await prisma.project.upsert({
      where: { id: FID['e2e-inv-project-a'] },
      update: projData,
      create: { id: FID['e2e-inv-project-a'], ...projData },
    });

    const D = (iso) => new Date(iso);
    await prisma.invitation.createMany({
      data: [
        { fromUserId: fromA, toUserId: inbox, projectId: proj.id, status: 'pending', createdAt: D('2026-07-08T09:00:00.000Z'),
          message: "J'ai adoré ton trait — ton encrage collerait parfaitement à l'ambiance pluvieuse du tome 2. J'imagine un récit en quatre arcs, beaucoup de scènes nocturnes, un chapitre par mois." },
        { fromUserId: fromB, toUserId: inbox, projectId: null, status: 'accepted', createdAt: D('2026-07-06T09:00:00.000Z'), respondedAt: D('2026-07-07T09:00:00.000Z'),
          message: 'On lance le projet ensemble.' },
        { fromUserId: fromB, toUserId: inbox, projectId: null, status: 'declined', createdAt: D('2026-07-04T09:00:00.000Z'), respondedAt: D('2026-07-05T09:00:00.000Z'),
          message: 'Une comédie romantique, ça te tente ?' },
      ],
    });

    // One invitation notification so the e2e can assert it links to /invitations (NOTIF_HREF fix).
    await prisma.notification.create({
      data: { recipientId: inbox, type: 'invitation', sourceUserId: fromA, createdAt: D('2026-07-08T09:00:00.000Z') },
    });
  }

  // ── CS-12: "Mes projets" dashboard fixtures for the dedicated CS12_OWNER account ──────────────
  // Owns 4 projects (one per status, the "en cours" one carrying step + a future nextReleaseAt) and
  // one illustration collection (3 members). CS12_COLLAB is an accepted collaborator on the "en cours"
  // project so the card's "Avec …" member line renders. Hermetic: reset this owner's projects,
  // invitations and collection membership first, then recreate deterministically.
  {
    const owner = accounts.CS12_OWNER.id;
    const collab = accounts.CS12_COLLAB.id;
    const inDays = (n) => new Date(Date.now() + n * 864e5);

    // Profiles carry creatorRoles[0] so the dashboard resolves each member's role glyph.
    await prisma.profile.upsert({ where: { accountId: owner }, update: { creatorRoles: ['scenariste'] }, create: { accountId: owner, creatorRoles: ['scenariste'] } });
    await prisma.profile.upsert({ where: { accountId: collab }, update: { creatorRoles: ['dessinateur'] }, create: { accountId: collab, creatorRoles: ['dessinateur'] } });

    // Reset: invitations on/for these accounts, then this owner's projects (invitations FK-restrict).
    // CS-2: Page rows (kanban cards, e.g. from cs2-espace-projet.spec.ts creating projects as this
    // owner) FK-restrict Project deletion too — drop them first.
    await prisma.invitation.deleteMany({ where: { OR: [{ fromUserId: owner }, { toUserId: owner }, { fromUserId: collab }, { toUserId: collab }] } });
    await prisma.page.deleteMany({ where: { project: { ownerId: owner } } });
    await prisma.project.deleteMany({ where: { ownerId: owner } });

    const PROJECTS = [
      { id: FID['e2e-cs12-proj-cours'], title: 'E2E CS12 · En cours', kind: 'Manga', genre: 'Seinen', status: 'en cours', slug: 'e2e-cs12-en-cours', step: 'encrage Ch.1', nextReleaseAt: inDays(11) },
      { id: FID['e2e-cs12-proj-revision'], title: 'E2E CS12 · En révision', kind: 'Manga', genre: 'Fantastique', status: 'en révision', slug: 'e2e-cs12-en-revision', step: 'corrections (2 notes)', nextReleaseAt: inDays(14) },
      { id: FID['e2e-cs12-proj-pause'], title: 'E2E CS12 · En pause', kind: 'Histoire', genre: 'Aventure', status: 'en pause', slug: 'e2e-cs12-en-pause', step: null, nextReleaseAt: null },
      { id: FID['e2e-cs12-proj-publie'], title: 'E2E CS12 · Publié', kind: 'Manga', genre: 'Seinen', status: 'publié', slug: 'e2e-cs12-publie', step: null, nextReleaseAt: null },
    ];
    for (const p of PROJECTS) {
      // Same CS-1 bridge as the wizard (projects.service.ts:221): a Project with no Work 404s its
      // own workspace (`!project.work` → « Projet introuvable »), and CS-10's permission model hangs
      // off WorkCreator. Upsert-by-slug keeps the seed re-runnable (the projects above are wiped and
      // recreated, the works are not).
      const work = await prisma.work.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, title: p.title, genre: p.genre },
        update: {},
      });
      await prisma.workCreator.upsert({
        where: { workId_accountId: { workId: work.id, accountId: owner } },
        create: { workId: work.id, accountId: owner, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
        update: { groupRole: 'leader' },
      });
      await prisma.project.create({ data: { id: p.id, ownerId: owner, title: p.title, kind: p.kind, genre: p.genre, status: p.status, cover: null, slug: p.slug, step: p.step, nextReleaseAt: p.nextReleaseAt, workId: work.id } });
    }

    // Accepted collaborator on the "en cours" project → members[] = [owner(self), collab].
    await prisma.invitation.create({
      data: { fromUserId: owner, toUserId: collab, projectId: FID['e2e-cs12-proj-cours'], status: 'accepted', createdAt: inDays(-6), respondedAt: inDays(-5), message: 'On collabore sur ce projet.' },
    });

    // Illustration collection Work (format 'Illustration(s)') owned by CS12_OWNER, 3 members.
    const collectionData = {
      slug: 'e2e-cs12-carnet', title: 'E2E CS12 · Carnet', format: 'Illustration(s)', genre: 'Art', themes: [],
      audienceRating: 'Tous publics', publishedAt: inDays(-30), synopsis: 'Collection e2e CS-12.',
    };
    const collection = await prisma.work.upsert({ where: { slug: 'e2e-cs12-carnet' }, create: collectionData, update: collectionData });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: collection.id, accountId: owner } },
      create: { workId: collection.id, accountId: owner, role: 'dessinateur', order: 0 },
      update: {},
    });
    // Titles stay readable (the id is a uuid now, so it can no longer double as the display name).
    const illuNames = ['e2e-cs12-illu-1', 'e2e-cs12-illu-2', 'e2e-cs12-illu-3'];
    const illuIds = illuNames.map((name) => FID[name]);
    for (const name of illuNames) {
      const id = FID[name];
      const data = { id, title: `E2E CS12 ${name}`, artistId: owner, artistName: 'E2E CS12_OWNER', category: 'personnages', publishedAt: inDays(-30) };
      await prisma.illustration.upsert({ where: { id }, create: data, update: data });
    }
    await prisma.illustrationCollection.deleteMany({ where: { workId: collection.id } });
    for (let i = 0; i < illuIds.length; i++) {
      await prisma.illustrationCollection.create({ data: { workId: collection.id, illustrationId: illuIds[i], order: i } });
    }
  }

  // ── CS-2 card-modal extension: 2-member workspace fixture (ASSIGNÉ À / @mention e2e) ───────────
  // No "Gérer le groupe" UI (CS-10) exists yet to add a real second member to a freshly-created
  // project, so cs2-card-modal.spec.ts needs a seeded project that already has 2 real WorkCreators
  // to exercise assignee add/remove + @mention against a genuine project member (not the owner
  // themself — the server excludes the actor from its own notification). Reuses CS12_OWNER (scénariste)
  // / CS12_COLLAB (dessinateur) — both already have profiles from the CS-12 block above. Hermetic:
  // reset this fixture's pages/labels/notifications first, then upsert the Work + Project + both
  // WorkCreator rows (idempotent by slug/composite key, safe to rerun).
  {
    const owner = accounts.CS12_OWNER.id;
    const collab = accounts.CS12_COLLAB.id;
    const workData = {
      slug: 'e2e-cs2-multi', title: 'E2E CS2 · Multi-membre', format: 'Manga', genre: 'Seinen',
      themes: [], audienceRating: 'Tous publics', publishedAt: null,
    };
    const work = await prisma.work.upsert({ where: { slug: 'e2e-cs2-multi' }, create: workData, update: workData });
    await prisma.page.deleteMany({ where: { project: { workId: work.id } } });
    await prisma.projectLabel.deleteMany({ where: { project: { workId: work.id } } });
    const projectData = {
      ownerId: owner, title: 'E2E CS2 · Multi-membre', kind: 'Manga', genre: 'Seinen', status: 'en cours',
      slug: 'e2e-cs2-multi', workId: work.id, visibility: 'prive',
    };
    const project = await prisma.project.upsert({ where: { slug: 'e2e-cs2-multi' }, create: projectData, update: projectData });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: owner } },
      // CS-10: the owner row is the group leader holding the whole split (invariant: ≥1 leader, sum 100).
      create: { workId: work.id, accountId: owner, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader', sharePct: 100, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: collab } },
      create: { workId: work.id, accountId: collab, role: 'dessinateur', order: 1, groupRole: 'member', sharePct: 0 },
      update: { groupRole: 'member', sharePct: 0, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.notification.deleteMany({
      where: { recipientId: { in: [owner, collab] }, type: { in: ['project_activity', 'mention'] }, refId: project.id },
    });
  }

  // ── CS-5 review fixture: OWN dedicated 2-member workspace (QA, 2026-07-15) ─────────────────────
  // cs5-revision.spec.ts used to share `e2e-cs2-multi` with cs2-card-modal.spec.ts + cs4-editeur.spec.ts.
  // Under CI's file-level parallelism (workers:2), two of those specs can run CONCURRENTLY against the
  // SAME kanban board, each mutating it (adding "Page 1/2/3" cards, importing files) while the other
  // reads it — duplicate/contended DOM elements → strict-mode "resolved to 2 elements" failures in
  // ALL THREE specs' setup, not just cs5's. Giving cs5-revision its own project (never shared) removes
  // the cross-spec mutable-board contention entirely. Same shape as e2e-cs2-multi (owner = CS12
  // scénariste, a second real member = CS12 dessinateur for the authz-negative "member who is neither
  // author nor assignee" check) so the spec's authz coverage is unchanged. Hermetic: reset pages/labels
  // first, then upsert (idempotent, safe to rerun).
  {
    const owner = accounts.CS12_OWNER.id;
    const collab = accounts.CS12_COLLAB.id;
    const workData = {
      slug: 'e2e-cs5-review', title: 'E2E CS5 · Révision', format: 'Manga', genre: 'Seinen',
      themes: [], audienceRating: 'Tous publics', publishedAt: null,
    };
    const work = await prisma.work.upsert({ where: { slug: 'e2e-cs5-review' }, create: workData, update: workData });
    await prisma.page.deleteMany({ where: { project: { workId: work.id } } });
    await prisma.projectLabel.deleteMany({ where: { project: { workId: work.id } } });
    const projectData = {
      ownerId: owner, title: 'E2E CS5 · Révision', kind: 'Manga', genre: 'Seinen', status: 'en cours',
      slug: 'e2e-cs5-review', workId: work.id, visibility: 'prive',
    };
    const project = await prisma.project.upsert({ where: { slug: 'e2e-cs5-review' }, create: projectData, update: projectData });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: owner } },
      // CS-10: the owner row is the group leader holding the whole split (invariant: ≥1 leader, sum 100).
      create: { workId: work.id, accountId: owner, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader', sharePct: 100, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: collab } },
      create: { workId: work.id, accountId: collab, role: 'dessinateur', order: 1, groupRole: 'member', sharePct: 0 },
      update: { groupRole: 'member', sharePct: 0, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.notification.deleteMany({
      where: { recipientId: { in: [owner, collab] }, type: { in: ['project_activity', 'mention'] }, refId: project.id },
    });
  }

  // ── CS-4 realtime fixture: OWN dedicated 2-member workspace (QA, 2026-07-15) ────────────────────
  // cs4-editeur.spec.ts's two-context (editor realtime collaboration + CS-15) tests used to reuse
  // `e2e-cs2-multi`, ALSO used by cs2-card-modal.spec.ts — under CI's file-level parallelism they still
  // contended with each other even after cs5-revision was given its own fixture (reproduced live:
  // `--workers=2 --repeat-each=2` on cs2+cs4+cs5 still failed on cs2/cs4's shared board). cs4-editeur
  // only needs a project with 2 real members for the realtime mechanic (join/awareness/attribution) —
  // it doesn't depend on cs2-card-modal's specific card/assignment state — so it gets its own dedicated
  // project instead, leaving `e2e-cs2-multi` exclusively to cs2-card-modal.spec.ts. Same shape (owner =
  // CS12 scénariste, second member = CS12 dessinateur) so CS4-RT/RT2/CS15's authz + attribution coverage
  // is unchanged.
  {
    const owner = accounts.CS12_OWNER.id;
    const collab = accounts.CS12_COLLAB.id;
    const workData = {
      slug: 'e2e-cs4-multi', title: 'E2E CS4 · Multi-membre', format: 'Manga', genre: 'Seinen',
      themes: [], audienceRating: 'Tous publics', publishedAt: null,
    };
    const work = await prisma.work.upsert({ where: { slug: 'e2e-cs4-multi' }, create: workData, update: workData });
    await prisma.page.deleteMany({ where: { project: { workId: work.id } } });
    await prisma.projectLabel.deleteMany({ where: { project: { workId: work.id } } });
    const projectData = {
      ownerId: owner, title: 'E2E CS4 · Multi-membre', kind: 'Manga', genre: 'Seinen', status: 'en cours',
      slug: 'e2e-cs4-multi', workId: work.id, visibility: 'prive',
    };
    const project = await prisma.project.upsert({ where: { slug: 'e2e-cs4-multi' }, create: projectData, update: projectData });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: owner } },
      // CS-10: the owner row is the group leader holding the whole split (invariant: ≥1 leader, sum 100).
      create: { workId: work.id, accountId: owner, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader', sharePct: 100, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: collab } },
      create: { workId: work.id, accountId: collab, role: 'dessinateur', order: 1, groupRole: 'member', sharePct: 0 },
      update: { groupRole: 'member', sharePct: 0, permissions: ['ecriture', 'corrections'] },
    });
    await prisma.notification.deleteMany({
      where: { recipientId: { in: [owner, collab] }, type: { in: ['project_activity', 'mention'] }, refId: project.id },
    });
  }

  // ── CS-10 "Gérer le groupe" fixture: lone-owner project + an already-connected contact ─────────
  // A owns a fresh project alone (leader/100 %, exercises the empty-state hint too); B is an
  // accepted Connection of A (so B shows up in the invite modal's contacts picker) but starts with
  // NO WorkCreator row — cs10-group-permissions.spec.ts drives the real invite → accept → promote →
  // toggle → split → revoke flow itself. Hermetic: reset A's pending invitations to B, any stray
  // WorkCreator row for B, and both accounts' project_activity notifications before each run.
  {
    const a = accounts.CS10_A.id;
    const b = accounts.CS10_B.id;
    const c = accounts.CS10_C.id;
    await prisma.profile.upsert({ where: { accountId: a }, update: { creatorRoles: ['scenariste'] }, create: { accountId: a, creatorRoles: ['scenariste'] } });
    await prisma.profile.upsert({ where: { accountId: b }, update: { creatorRoles: ['dessinateur'] }, create: { accountId: b, creatorRoles: ['dessinateur'] } });
    await prisma.profile.upsert({ where: { accountId: c }, update: { creatorRoles: ['scenariste'] }, create: { accountId: c, creatorRoles: ['scenariste'] } });
    await prisma.connection.deleteMany({ where: { requesterId: { in: [a, b, c] }, addresseeId: { in: [a, b, c] } } });
    await prisma.connection.createMany({
      data: [
        { requesterId: a, addresseeId: b, status: 'accepted', respondedAt: new Date('2026-07-08T09:00:00.000Z') },
        // B⇄C — the co-leader invite probe (CS10-E15) needs a contact of B's who is not a member.
        { requesterId: b, addresseeId: c, status: 'accepted', respondedAt: new Date('2026-07-08T09:00:00.000Z') },
      ],
    });

    const workData = {
      slug: 'e2e-cs10-groupe', title: 'E2E CS10 · Groupe', format: 'Manga', genre: 'Seinen',
      themes: [], audienceRating: 'Tous publics', publishedAt: null,
    };
    const work = await prisma.work.upsert({ where: { slug: 'e2e-cs10-groupe' }, create: workData, update: workData });
    const projectData = {
      ownerId: a, title: 'E2E CS10 · Groupe', kind: 'Manga', genre: 'Seinen', status: 'en cours',
      slug: 'e2e-cs10-groupe', workId: work.id, visibility: 'prive',
    };
    const project = await prisma.project.upsert({ where: { slug: 'e2e-cs10-groupe' }, create: projectData, update: projectData });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: a } },
      create: { workId: work.id, accountId: a, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader', sharePct: 100, permissions: ['ecriture', 'corrections'] },
    });
    // B/C may have joined/been revoked in a previous local run — start each run with both absent.
    await prisma.workCreator.deleteMany({ where: { workId: work.id, accountId: { in: [b, c] } } });
    await prisma.invitation.deleteMany({ where: { fromUserId: { in: [a, b] }, toUserId: { in: [b, c] } } });
    // Dedicated fixture accounts (no other spec references them) — safe to clear ALL their
    // project-activity / invitation notifications between runs.
    await prisma.notification.deleteMany({
      where: { recipientId: { in: [a, b, c] }, type: { in: ['project_activity', 'invitation'] } },
    });
  }

  // ── CS-8: project Discussion fixture — a project with TWO members ──────────────────────────────
  // Reuses the CS-10 accounts (A owner, B co-author) on a SEPARATE project so the CS-10 spec's
  // invite/revoke flow can't interfere. The thread itself is provisioned lazily by the API on first
  // access (that is CS-8's whole provisioning path), so nothing seeds a Conversation here.
  {
    const a = accounts.CS10_A.id;
    const b = accounts.CS10_B.id;
    const workData = {
      slug: 'e2e-cs8-discussion', title: 'E2E CS8 · Discussion', format: 'Manga', genre: 'Seinen',
      themes: [], audienceRating: 'Tous publics', publishedAt: null,
    };
    const work = await prisma.work.upsert({ where: { slug: 'e2e-cs8-discussion' }, create: workData, update: workData });
    const projectData = {
      ownerId: a, title: 'E2E CS8 · Discussion', kind: 'Manga', genre: 'Seinen', status: 'en cours',
      slug: 'e2e-cs8-discussion', workId: work.id, visibility: 'prive',
    };
    const project = await prisma.project.upsert({ where: { slug: 'e2e-cs8-discussion' }, create: projectData, update: projectData });
    for (const [accountId, role, order, groupRole] of [[a, 'scenariste', 0, 'leader'], [b, 'dessinateur', 1, 'member']]) {
      await prisma.workCreator.upsert({
        where: { workId_accountId: { workId: work.id, accountId } },
        create: { workId: work.id, accountId, role, order, groupRole, sharePct: order === 0 ? 100 : 0, permissions: ['ecriture'] },
        update: { groupRole, permissions: ['ecriture'] },
      });
    }
    // Hermetic: every run starts on an empty thread (the conversation cascades its messages).
    await prisma.conversation.deleteMany({ where: { projectId: project.id } });
  }

  // ── CS-13: "Modifier une illustration" fixtures for the dedicated CS13_OWNER account ───────────
  // 5 published, standalone illustrations owned by CS13_OWNER: "e2e-cs13-illu-main" is the edit
  // target (PATCH-able, incl. a Licence value the test changes); the other 4 exist purely so
  // "Plus de cet·te artiste" has something to cap at 4 and "Voir tout" -> /galerie?artist=<slug>
  // has a filterable set. Idempotent (upsert by id).
  {
    const owner = accounts.CS13_OWNER.id;
    await prisma.profile.upsert({
      where: { accountId: owner },
      update: { creatorRoles: ['dessinateur'] },
      create: { accountId: owner, creatorRoles: ['dessinateur'] },
    });
    const inDays = (n) => new Date(Date.now() + n * 864e5);
    // 6 illustrations besides the edit target — proves the "Plus de cet·te artiste" cap actually
    // caps (4 shown out of 6 available), not just "happens to be ≤4".
    const cs13Illus = [
      { id: FID['e2e-cs13-illu-main'], title: 'E2E CS13 Principale' },
      { id: FID['e2e-cs13-illu-2'], title: 'E2E CS13 Autre 2' },
      { id: FID['e2e-cs13-illu-3'], title: 'E2E CS13 Autre 3' },
      { id: FID['e2e-cs13-illu-4'], title: 'E2E CS13 Autre 4' },
      { id: FID['e2e-cs13-illu-5'], title: 'E2E CS13 Autre 5' },
      { id: FID['e2e-cs13-illu-6'], title: 'E2E CS13 Autre 6' },
      { id: FID['e2e-cs13-illu-7'], title: 'E2E CS13 Autre 7' },
    ];
    for (const { id, title } of cs13Illus) {
      const data = {
        id, title, artistId: owner, artistName: 'E2E CS13_OWNER', category: 'personnages',
        description: 'Fixture CS-13.', tools: 'Encre · CSP', license: '© Tous droits réservés',
        publishedAt: inDays(-20),
      };
      await prisma.illustration.upsert({ where: { id }, create: data, update: data });
    }
  }

  // ── MC-12: dedicated group-management fixtures for MC12_A (creator) ⇄ B/C/D ───────────────
  // Reset first (hermetic across re-runs): wipe any conversation/connection/project any of these 4
  // accounts touch, then re-establish accepted connections A⇄B, A⇄C, A⇄D (so "＋ Groupe"/"Ajouter"
  // contact pickers list them) and one PROJECT-LINKED group conversation (simulating the CS-8 project
  // chat shape directly, since CS-8 itself isn't implemented yet) for the standalone-only 409 e2e check.
  {
    const a = accounts.MC12_A.id;
    const b = accounts.MC12_B.id;
    const c = accounts.MC12_C.id;
    const d = accounts.MC12_D.id;
    const ids = [a, b, c, d];

    const mc12Parts = await prisma.conversationParticipant.findMany({
      where: { accountId: { in: ids } },
      select: { conversationId: true },
    });
    const mc12ConvIds = [...new Set(mc12Parts.map((p) => p.conversationId))];
    if (mc12ConvIds.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: mc12ConvIds } } });
    }
    await prisma.connection.deleteMany({
      where: { OR: [{ requesterId: { in: ids } }, { addresseeId: { in: ids } }] },
    });
    await prisma.project.deleteMany({ where: { ownerId: a, title: 'MC12 Projet fixture' } });

    for (const other of [b, c, d]) {
      await prisma.connection.create({
        data: { requesterId: a, addresseeId: other, status: 'accepted', respondedAt: new Date() },
      });
    }

    // `Project.workId` is NOT NULL — seed the Work half too. Upsert-by-slug so the re-run reuses it
    // (the Project above is deleted each run, which frees the unique `workId` again).
    const mc12Work = await prisma.work.upsert({
      where: { slug: 'e2e-mc12-projet-fixture' },
      create: { slug: 'e2e-mc12-projet-fixture', title: 'MC12 Projet fixture', genre: 'Seinen' },
      update: {},
    });
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: mc12Work.id, accountId: a } },
      create: { workId: mc12Work.id, accountId: a, role: 'scenariste', order: 0, groupRole: 'leader', sharePct: 100 },
      update: { groupRole: 'leader' },
    });
    const mc12Project = await prisma.project.create({
      data: { ownerId: a, title: 'MC12 Projet fixture', kind: 'Manga', workId: mc12Work.id },
    });
    const mc12ProjectGroup = await prisma.conversation.create({
      data: {
        type: 'group',
        name: 'MC12 Projet fixture · Discussion',
        projectId: mc12Project.id,
        createdBy: a,
        participants: { create: [{ accountId: a }, { accountId: b }] },
      },
    });
    accounts.MC12_PROJECT_GROUP = { email: '', id: mc12ProjectGroup.id };
  }

  // ── F-3: stale/invalid seeking.targetRole must not block a creatorRoles save (2026-07-10 bug fix)
  // — dedicated F3_STALE_ROLE fixture. Reset then recreate: an ACCEPTED application on a standalone
  // call (authorId: null — no owner needed) plus the legacy invalid seekingTargetRole, so the e2e test
  // reads this precondition read-only instead of shelling out to psql (which can't reach CI's DB).
  {
    const fixture = accounts.F3_STALE_ROLE.id;
    await prisma.profile.upsert({
      where: { accountId: fixture },
      update: { creatorRoles: ['scenariste'], seekingActive: true, seekingTargetRole: 'dessinateur' },
      create: { accountId: fixture, creatorRoles: ['scenariste'], seekingActive: true, seekingTargetRole: 'dessinateur' },
    });

    await prisma.application.deleteMany({ where: { applicantId: fixture } });
    await prisma.projectCall.deleteMany({ where: { id: FID['e2e-f3-stale-role-call'] } });
    const f3Call = await prisma.projectCall.create({
      data: {
        id: FID['e2e-f3-stale-role-call'],
        title: 'E2E F3 Stale Role Call',
        authorRoles: ['dessinateur'],
        seekingRoles: ['scenariste'],
        seats: { scenariste: 1 },
        authorId: null,
        authorName: 'E2E Fixture',
        genres: ['shonen'],
        // closed — this call only needs to HOST the accepted application; the accepted-app
        // precondition doesn't care about call status. Open would make it the newest open call
        // (createdAt defaults to seed-run time, always after seed.js's fixed old timestamps) and
        // intrude on the global "newest open calls" band (trouver.spec.ts MC1-E9 is exact about the
        // top-2 being seed.js's "Seinen urbain"/"Comédie romantique" — a QA finding from CI).
        status: 'closed',
      },
    });
    await prisma.application.create({
      data: {
        callId: f3Call.id,
        applicantId: fixture,
        sampleUrl: 'https://example.com/e2e-f3-sample.jpg',
        status: 'accepted',
        appliedAs: 'scenariste',
      },
    });
  }

  // ── MC-5/MC-6 batch (2026-07-10) — dedicated MC_BATCH_SCENARISTE fixture for
  // calls-batch-fixes.spec.ts's portfolio-pick apply/view/edit flows (Items 1 and 3+6). Not shared
  // with any other spec file. Idempotent (upsert profile, reset-then-recreate portfolio).
  {
    const scenariste = accounts.MC_BATCH_SCENARISTE.id;
    await prisma.profile.upsert({
      where: { accountId: scenariste },
      update: { creatorRoles: ['scenariste'] },
      create: { accountId: scenariste, creatorRoles: ['scenariste'] },
    });

    // 2 portfolio pieces so the apply modal's inline picker has something to pick (mirrors the
    // seeded camille fixture other specs use — this account just isn't shared with them).
    const scenaristeProfile = await prisma.profile.findUnique({ where: { accountId: scenariste }, select: { id: true } });
    await prisma.portfolioItem.deleteMany({ where: { profileId: scenaristeProfile.id } });
    await prisma.portfolioItem.createMany({
      data: [
        { profileId: scenaristeProfile.id, image: 'https://example.com/e2e-mc-batch-portfolio-1.jpg', caption: 'Échantillon 1', order: 0 },
        { profileId: scenaristeProfile.id, image: 'https://example.com/e2e-mc-batch-portfolio-2.jpg', caption: 'Échantillon 2', order: 1 },
      ],
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
