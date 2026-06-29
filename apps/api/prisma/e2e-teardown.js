'use strict';
/**
 * E2E teardown — removes all seeded qa_e2e_* accounts.
 * Called by apps/web/e2e/global-teardown.ts after each e2e run.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  await prisma.account.deleteMany({
    where: { email: { startsWith: 'qa_e2e_' } },
  });
  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
