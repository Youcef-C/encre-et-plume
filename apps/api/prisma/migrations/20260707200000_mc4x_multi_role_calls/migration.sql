-- MC-4X req6: multi-role calls + optional linked project.
-- Hand-edited: add seekingRoles[] → BACKFILL the single seekingRole into 1-element arrays → drop it.

-- AlterTable: new columns.
ALTER TABLE "ProjectCall"
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "seekingRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill BEFORE the drop: every existing call's single sought role becomes a 1-element array.
UPDATE "ProjectCall" SET "seekingRoles" = ARRAY["seekingRole"] WHERE "seekingRole" IS NOT NULL;

-- AlterTable: drop the retired single-role column (data preserved above).
ALTER TABLE "ProjectCall" DROP COLUMN "seekingRole";

-- AddForeignKey: projectId → Project (SET NULL keeps the call if the project is deleted).
ALTER TABLE "ProjectCall" ADD CONSTRAINT "ProjectCall_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
