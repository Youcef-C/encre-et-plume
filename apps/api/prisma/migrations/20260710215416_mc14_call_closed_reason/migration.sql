-- AlterTable
ALTER TABLE "ProjectCall" ADD COLUMN     "closedReason" TEXT;

-- MC-14: backfill existing closed calls conservatively as a manual (sticky) close — never auto-reopened.
-- Open rows keep the NULL default.
UPDATE "ProjectCall" SET "closedReason" = 'manual' WHERE "status" = 'closed';
