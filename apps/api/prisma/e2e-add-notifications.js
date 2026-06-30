'use strict';
/**
 * E2E helper — inserts a deterministic mix of Notification rows for a given account slug.
 * Usage: node e2e-add-notifications.js <recipientSlug> [sourceSlug]
 *
 * Inserts: 3 unread messages, 2 unread applications, 1 unread report, 1 read like.
 * The report row is used to verify admin/maintainer-scoped signalements count.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [recipientSlug, sourceSlug] = process.argv.slice(2);
  if (!recipientSlug) throw new Error('Usage: e2e-add-notifications.js <recipientSlug> [sourceSlug]');

  const prisma = new PrismaClient();
  try {
    const recipient = await prisma.account.findUnique({ where: { profileSlug: recipientSlug } });
    if (!recipient) throw new Error(`No account with profileSlug: ${recipientSlug}`);

    const source = sourceSlug
      ? await prisma.account.findUnique({ where: { profileSlug: sourceSlug } })
      : null;

    // Clear existing notifications for idempotency
    await prisma.notification.deleteMany({ where: { recipientId: recipient.id } });

    const now = new Date();
    const specs = [
      { type: 'message', readAt: null },
      { type: 'message', readAt: null },
      { type: 'message', readAt: null },
      { type: 'application', readAt: null },
      { type: 'application', readAt: null },
      { type: 'report', readAt: null },
      { type: 'like', readAt: new Date(now.getTime() - 60000) }, // already read
    ];

    for (const spec of specs) {
      await prisma.notification.create({
        data: {
          recipientId: recipient.id,
          type: spec.type,
          readAt: spec.readAt,
          sourceUserId: source?.id ?? null,
          createdAt: new Date(now.getTime() - Math.random() * 3600000),
        },
      });
    }

    process.stdout.write(
      `Inserted ${specs.length} notifications for ${recipientSlug} (3 messages, 2 applications, 1 report, 1 read like)\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
