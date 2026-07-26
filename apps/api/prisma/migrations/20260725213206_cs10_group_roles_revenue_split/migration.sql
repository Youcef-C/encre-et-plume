-- AlterTable
ALTER TABLE "WorkCreator" ADD COLUMN     "groupRole" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY['ecriture', 'corrections']::TEXT[],
ADD COLUMN     "sharePct" INTEGER NOT NULL DEFAULT 0;

-- CS-10 backfill (1/2): legacy safety net — every project owner must own a WorkCreator row on the
-- project's Work, otherwise the group has no leader to carry the 100 % share.
INSERT INTO "WorkCreator" ("id", "workId", "accountId", "role", "order", "groupRole", "permissions", "sharePct")
SELECT
  'cs10_' || substr(md5(p."id" || p."ownerId"), 1, 20),
  p."workId",
  p."ownerId",
  'scenariste',
  (SELECT count(*) FROM "WorkCreator" wc2 WHERE wc2."workId" = p."workId"),
  'member',
  ARRAY['ecriture', 'corrections']::TEXT[],
  0
FROM "Project" p
WHERE p."workId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "WorkCreator" wc WHERE wc."workId" = p."workId" AND wc."accountId" = p."ownerId"
  );

-- CS-10 backfill (2/2): the owner's row becomes the group leader holding the whole split. Every other
-- row keeps the defaults (member / 0 % / ecriture+corrections) → each existing group sums to 100 %
-- with at least one leader. Non-project Works (seeded œuvres) keep harmless defaults.
UPDATE "WorkCreator" wc
SET "groupRole" = 'leader', "sharePct" = 100
FROM "Project" p
WHERE p."workId" = wc."workId" AND p."ownerId" = wc."accountId";
