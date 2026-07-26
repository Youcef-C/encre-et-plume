-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Page_createdById_idx" ON "Page"("createdById");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CS-10 D-1 backfill: cards predating this column have no recorded author. Attribute them to their
-- project's owner so they stay deletable by someone instead of becoming leadership-only orphans.
-- Runs AFTER the FK so a bad ownerId would fail the migration rather than land a dangling reference.
UPDATE "Page" p
SET "createdById" = pr."ownerId"
FROM "Project" pr
WHERE p."projectId" = pr."id" AND p."createdById" IS NULL;
