'use strict';
/**
 * E2E helper — sets the role of a single account by id.
 * Usage: node e2e-set-role.js <accountId> <role>
 * Called by roles.spec.ts dbSetRole() via execFileSync — synchronous from the caller's POV.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [id, role] = process.argv.slice(2);
  if (!id || !role) throw new Error('Usage: e2e-set-role.js <id> <role>');

  const prisma = new PrismaClient();
  await prisma.account.update({ where: { id }, data: { role } });
  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
