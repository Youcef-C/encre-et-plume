'use strict';
/**
 * E2E teardown — removes all seeded qa_e2e_* accounts (and their profiles + portfolio items).
 * Deletes in FK-dependency order: PortfolioItem → Profile → Notification → Account.
 * Called by apps/web/e2e/global-teardown.ts after each e2e run.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  // Find all qa_e2e_ accounts and their profile ids (for cascade-safe deletion)
  const accounts = await prisma.account.findMany({
    where: { email: { startsWith: 'qa_e2e_' } },
    include: { profile: { select: { id: true } } },
  });
  const profileIds = accounts.map((a) => a.profile?.id).filter(Boolean);

  // 1. Delete portfolio items for those profiles
  if (profileIds.length > 0) {
    await prisma.portfolioItem.deleteMany({ where: { profileId: { in: profileIds } } });
  }

  // 2. Delete profiles
  const accountIds = accounts.map((a) => a.id);
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

  // 4. Delete accounts
  await prisma.account.deleteMany({
    where: { email: { startsWith: 'qa_e2e_' } },
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
