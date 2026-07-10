-- AlterEnum
ALTER TYPE "NotifType" ADD VALUE 'group_removed';

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "createdBy" TEXT;

-- MC-12 backfill: existing groups get the earliest-joined participant as owner.
-- Group creation batch-inserts identical createdAt values, so "accountId ASC" is the
-- deterministic tie-break — the SAME ordering is used at leave-transfer time.
UPDATE "Conversation" c SET "createdBy" = (
  SELECT p."accountId" FROM "ConversationParticipant" p
  WHERE p."conversationId" = c."id"
  ORDER BY p."createdAt" ASC, p."accountId" ASC
  LIMIT 1
)
WHERE c."type" = 'group' AND c."createdBy" IS NULL;
