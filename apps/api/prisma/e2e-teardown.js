'use strict';
/**
 * E2E teardown — removes all seeded qa_e2e_* accounts (and their profiles + portfolio items).
 * Deletes in FK-dependency order:
 *   DataExport → Media → PortfolioItem → Profile → Notification → ConsentRecord → Account.
 * Called by apps/web/e2e/global-teardown.ts after each e2e run.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

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
