'use strict';
/**
 * E2E helper — upserts a Profile for a given account slug and inserts N ordered PortfolioItems.
 * Usage: node e2e-add-portfolio.js <profileSlug> <count>
 * Called by profile e2e specs so they can exercise the portfolio grid without a create endpoint (D5).
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const [slug, countStr] = process.argv.slice(2);
  if (!slug || !countStr) throw new Error('Usage: e2e-add-portfolio.js <profileSlug> <count>');
  const count = parseInt(countStr, 10);
  if (isNaN(count) || count < 0) throw new Error('count must be a non-negative integer');

  const prisma = new PrismaClient();
  try {
    const account = await prisma.account.findUnique({ where: { profileSlug: slug } });
    if (!account) throw new Error(`No account found with profileSlug: ${slug}`);

    // Upsert profile (lazy creation per D6)
    const profile = await prisma.profile.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id },
      update: {},
    });

    // Clear existing items first so repeated runs are idempotent
    await prisma.portfolioItem.deleteMany({ where: { profileId: profile.id } });

    // Insert N portfolio items ordered 0..N-1
    for (let i = 0; i < count; i++) {
      await prisma.portfolioItem.create({
        data: {
          profileId: profile.id,
          image: `https://example.com/portfolio/${slug}-${i}.jpg`,
          caption: `Œuvre ${i + 1}`,
          order: i,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
