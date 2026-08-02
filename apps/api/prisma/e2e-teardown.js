'use strict';
/**
 * E2E teardown — removes all seeded qa_e2e_* accounts (and their profiles + portfolio items).
 * Deletes in FK-dependency order:
 *   DataExport → Media → PortfolioItem → Profile → Notification → ConsentRecord → Account.
 * Called by apps/web/e2e/global-teardown.ts after each e2e run.
 */
const { e2ePrisma } = require('./_e2e-prisma');

async function main() {
  const prisma = e2ePrisma(5);

  // Find all qa_e2e_ accounts and their profile ids (for cascade-safe deletion)
  const accounts = await prisma.account.findMany({
    // `qa_`, not `qa_e2e_`: specs mint throwaway accounts under many prefixes (`qa_mentA_`, `qa_rtA_`,
    // `qa_trig_`, `qa_probe_` …) and only `qa_e2e_` was ever swept, so the rest accumulated forever —
    // 651 of them against 15 seeded accounts, with their salon memberships. That is what made
    // MC13-E4 fail: every stale account still counts in Le Comptoir's roster badge.
    // Seeded fixtures live on `@seed.encre-et-plume.local` and never match this prefix.
    where: { OR: [{ email: { startsWith: 'qa_' } }, { email: { startsWith: 'deleted+' } }] },
    include: { profile: { select: { id: true } } },
  });
  const profileIds = accounts.map((a) => a.profile?.id).filter(Boolean);
  const accountIds = accounts.map((a) => a.id);

  // 0a. Delete DataExport rows for those accounts (F-14 — FK to Account + Media)
  if (accountIds.length > 0) {
    await prisma.dataExport.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 0b. Delete Media owned by those accounts (F-10 — added before Account deletion)
  if (accountIds.length > 0) {
    await prisma.media.deleteMany({ where: { ownerId: { in: accountIds } } });
  }

  // 1. Delete portfolio items for those profiles
  if (profileIds.length > 0) {
    await prisma.portfolioItem.deleteMany({ where: { profileId: { in: profileIds } } });
  }

  // 2. Delete profiles
  if (accountIds.length > 0) {
    await prisma.profile.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 3. Delete notifications referencing those accounts (recipient or source)
  if (accountIds.length > 0) {
    await prisma.notification.deleteMany({
      where: {
        OR: [{ recipientId: { in: accountIds } }, { sourceUserId: { in: accountIds } }],
      },
    });
  }

  // 4. Delete consent records (F-13 — FK-restricts Account deletion)
  if (accountIds.length > 0) {
    await prisma.consentRecord.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 4a. Delete F-18 TwoFactorCredential rows (FK to Account)
  if (accountIds.length > 0) {
    await prisma.twoFactorCredential.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 4b. Delete F-18 EmailChangeToken rows (FK to Account)
  if (accountIds.length > 0) {
    await prisma.emailChangeToken.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 4c. Delete F-11/F-12 verification & reset tokens (FK to Account)
  if (accountIds.length > 0) {
    await prisma.emailVerificationToken.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 4d. Delete MC-8 Connection rows referencing those accounts (FK-restricts Account deletion)
  if (accountIds.length > 0) {
    await prisma.connection.deleteMany({
      where: { OR: [{ requesterId: { in: accountIds } }, { addresseeId: { in: accountIds } }] },
    });
  }

  // 4e. Delete MC-9 messaging rows (Message.senderId + ConversationParticipant.accountId FK-restrict
  // Account deletion). Deleting the conversations cascades their participants + messages; then sweep
  // any stray rows still referencing a seeded account.
  if (accountIds.length > 0) {
    const parts = await prisma.conversationParticipant.findMany({
      where: { accountId: { in: accountIds } },
      select: { conversationId: true },
    });
    const convIds = [...new Set(parts.map((p) => p.conversationId))];
    if (convIds.length > 0) {
      await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
    }
    await prisma.message.deleteMany({ where: { senderId: { in: accountIds } } });
    await prisma.conversationParticipant.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  // 4f. MC-10 (B14): a seeded account may own a WorkCreator row / an Illustration (the mutual
  // content-hiding fixtures) — both FK-restrict Account deletion. Drop the WorkCreator row (the Work
  // itself stays, re-upserted by the seed) and null out Illustration.artistId (denormalized
  // artistName survives, same nullable pattern as Review.authorId).
  if (accountIds.length > 0) {
    await prisma.workCreator.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.illustration.updateMany({ where: { artistId: { in: accountIds } }, data: { artistId: null } });
  }

  // 4g. MC-3: Invitations FK-restrict Account deletion (fromUserId/toUserId) and Project deletion
  // (projectId). Drop invitations touching a seeded account, then the Projects those accounts own.
  // CS-2: Page rows (kanban cards) FK-restrict Project deletion too — drop them first.
  if (accountIds.length > 0) {
    await prisma.invitation.deleteMany({
      where: { OR: [{ fromUserId: { in: accountIds } }, { toUserId: { in: accountIds } }] },
    });
    await prisma.page.deleteMany({ where: { project: { ownerId: { in: accountIds } } } });
    await prisma.project.deleteMany({ where: { ownerId: { in: accountIds } } });
  }

  // 4g-bis. Seed-coherence pass (2026-08-02): deleting a Project does NOT delete its Work — the
  // bridge is `Project.workId`, and nothing points the other way. So every run left one ORPHAN Work
  // per project behind: 184 of them had accumulated, each auditing as « a work with no creator »
  // (which is what the seed-coherence evidence read as "the app never writes WorkCreator" — the app
  // does; the teardown was deleting the row and keeping the shell). Sweep the shells.
  // Scoped to the e2e/qa slug prefixes AND to works no Project points at, so a real fixture is never
  // touched. Best-effort: an unexpected dependent must not abort the rest of this teardown.
  try {
    const orphans = await prisma.work.findMany({
      where: { OR: [{ slug: { startsWith: 'e2e-' } }, { slug: { startsWith: 'qa-' } }], project: null },
      select: { id: true },
    });
    const ids = orphans.map((w) => w.id);
    if (ids.length > 0) {
      const chapters = await prisma.chapter.findMany({ where: { workId: { in: ids } }, select: { id: true } });
      const chapterIds = chapters.map((c) => c.id);
      if (chapterIds.length > 0) {
        await prisma.readingProgress.deleteMany({ where: { chapterId: { in: chapterIds } } });
        await prisma.page.deleteMany({ where: { chapterId: { in: chapterIds } } });
      }
      await prisma.readingProgress.deleteMany({ where: { workId: { in: ids } } });
      await prisma.favorite.deleteMany({ where: { workId: { in: ids } } });
      await prisma.watchlistItem.deleteMany({ where: { workId: { in: ids } } });
      await prisma.review.deleteMany({ where: { workId: { in: ids } } });
      await prisma.fundingGoal.deleteMany({ where: { workId: { in: ids } } });
      await prisma.planche.deleteMany({ where: { workId: { in: ids } } });
      await prisma.editorPick.deleteMany({ where: { workId: { in: ids } } });
      await prisma.illustrationCollection.deleteMany({ where: { workId: { in: ids } } });
      await prisma.chapter.deleteMany({ where: { workId: { in: ids } } });
      await prisma.workCreator.deleteMany({ where: { workId: { in: ids } } });
      const { count } = await prisma.work.deleteMany({ where: { id: { in: ids } } });
      process.stdout.write(`[e2e-teardown] swept ${count} orphan e2e Work row(s)\n`);
    }
  } catch (err) {
    process.stderr.write(`[e2e-teardown] orphan Work sweep skipped: ${err}\n`);
  }

  // 4h. CS-12: drop the dedicated dashboard collection Work + its illustrations (both cascade their
  // IllustrationCollection membership). 4f already removed the WorkCreator + nulled artistId, so these
  // deletes are unblocked; removing them keeps the collection fixtures from leaking across runs.
  await prisma.work.deleteMany({ where: { slug: 'e2e-cs12-carnet' } });
  // Ids are native `uuid` columns, so a `startsWith` prefix match is no longer expressible (nor was
  // it ever a real invariant). The three CS-12 fixture ids are enumerated instead — keep in sync with
  // e2e-seed.js's FID map (`e2e-cs12-illu-1..3`).
  await prisma.illustration.deleteMany({
    where: {
      id: {
        in: [
          '00000000-0000-7000-8000-000000000515',
          '00000000-0000-7000-8000-000000000516',
          '00000000-0000-7000-8000-000000000517',
        ],
      },
    },
  });

  // 4h-bis. DR-12: the collection specs create their collections through the API as a SEEDED account
  // (Yuki), so nothing above ever swept them and one `qa-*-collection-<ts>` Work per spec accumulated
  // every run — 13 of them by the CS-7 follow-up, which pushed the seeded "Carnet d'Encre" off the
  // first Galerie « Collections » page and made collections.spec E6 fail on all 3 attempts. Scoped to
  // format 'Illustration(s)' on purpose: a `qa-` Manga/Histoire Work can be a Project's Work, and
  // `Project.workId` FK-restricts the delete. Membership rows cascade with the Work; the creator row
  // (the collection is created by a SEEDED account, so 4f leaves it) FK-restricts and goes first.
  // Best-effort: an unexpected dependent must not abort the rest of this teardown.
  try {
    const scratchCollections = { slug: { startsWith: 'qa-' }, format: 'Illustration(s)' };
    await prisma.workCreator.deleteMany({ where: { work: scratchCollections } });
    await prisma.work.deleteMany({ where: scratchCollections });
  } catch (err) {
    process.stderr.write(`[e2e-teardown] qa- collection sweep skipped: ${err}\n`);
  }

  // 4i. F-3: MC-5 Application rows FK-restrict Account deletion (applicantId). The re-seed on the
  // next run recreates the F3_STALE_ROLE fixture's application; the standalone (authorId: null) call
  // itself has no FK to a seeded account, so it doesn't need cleanup here.
  if (accountIds.length > 0) {
    await prisma.application.deleteMany({ where: { applicantId: { in: accountIds } } });
  }

  // 4z. Safety net for every OTHER table that FK-restricts Account deletion.
  //
  // The explicit steps above were written once and never revisited, so each new table with a
  // RESTRICT foreign key to Account (NotificationPreference, Favorite, Reaction, PageAssignee,
  // ReadingProgress, WatchlistItem …) silently started blocking teardown — 26 such tables exist today.
  // Enumerating one more by hand would just restart the rot, so derive them from the live catalog
  // instead: this stays correct when the schema grows.
  //
  // Scoped strictly to the throwaway accounts collected above. Looped because a dependent can itself
  // be FK-blocked by its own dependent (Media ← AssetVersion); each pass clears one layer, and we
  // stop as soon as a pass deletes nothing.
  if (accountIds.length > 0) {
    const refs = await prisma.$queryRawUnsafe(`
      SELECT kcu.table_name AS "table", kcu.column_name AS "column"
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'Account'
        AND rc.delete_rule = 'RESTRICT'
        -- Pin every join to one schema. Without this the joins fan out across every schema in the
        -- database — a dev box with leftover Prisma shadow schemas returned 45k rows for 28 real
        -- pairs, at ~7.7s per pass. DISTINCT alone would hide the cost, not remove it.
        AND tc.table_schema = 'public'
        AND kcu.table_schema = 'public'
        AND ccu.table_schema = 'public'
        AND rc.constraint_schema = 'public'
      GROUP BY kcu.table_name, kcu.column_name
    `);
    for (let pass = 0; pass < 5; pass++) {
      let removed = 0;
      for (const { table, column } of refs) {
        try {
          removed += await prisma.$executeRawUnsafe(
            // `::uuid[]`, not `::text[]`: Account.id and every FK to it are native `uuid` columns,
            // and `uuid = ANY(text[])` has no operator — the error was swallowed by the catch below,
            // so nothing was deleted and the account delete then failed on the FK it was meant to clear.
            `DELETE FROM "${table}" WHERE "${column}" = ANY($1::uuid[])`,
            accountIds,
          );
        } catch {
          // Still blocked by a deeper dependent — a later pass clears it.
        }
      }
      if (removed === 0) break;
    }
  }

  // 5. Delete accounts — must match the `accounts` lookup at the top of this file, or we clear a
  // wider set's dependents and then delete only a narrow subset, leaving the accounts themselves
  // behind (that mismatch is how 651 `qa_*` accounts accumulated).
  await prisma.account.deleteMany({
    where: { OR: [{ email: { startsWith: 'qa_' } }, { email: { startsWith: 'deleted+' } }] },
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
