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
    where: { OR: [{ email: { startsWith: 'qa_e2e_' } }, { email: { startsWith: 'deleted+' } }] },
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
  if (accountIds.length > 0) {
    await prisma.invitation.deleteMany({
      where: { OR: [{ fromUserId: { in: accountIds } }, { toUserId: { in: accountIds } }] },
    });
    await prisma.project.deleteMany({ where: { ownerId: { in: accountIds } } });
  }

  // 5. Delete accounts
  await prisma.account.deleteMany({
    where: { email: { startsWith: 'qa_e2e_' } },
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
