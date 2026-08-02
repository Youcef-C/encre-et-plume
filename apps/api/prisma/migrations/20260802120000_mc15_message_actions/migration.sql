-- MC-15 — message actions « Répondre · Modifier · Supprimer · J'aime ».
--
-- One `Message` table backs all three surfaces (MC-9 DMs/groups, MC-11 salon, CS-8 project thread),
-- so the whole story is these columns plus one join table — never a per-surface model.
--
-- `replyToId` is ON DELETE SET NULL: deleting a quoted message must not cascade away the reply that
-- quoted it. That alone erases the FACT that a reply existed, so `replyToDeleted` records it and the
-- reply keeps rendering its quote as « Message supprimé » (D-3). The delete path sets the flag in the
-- same transaction as the delete.
ALTER TABLE "Message"
  ADD COLUMN "replyToId" TEXT,
  ADD COLUMN "replyToDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId")
  REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One like per person per message: the composite PK makes a double like unrepresentable rather than
-- app-enforced, so the toggle is idempotent by construction.
CREATE TABLE "MessageLike" (
  "messageId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MessageLike_pkey" PRIMARY KEY ("messageId","accountId")
);

CREATE INDEX "MessageLike_accountId_idx" ON "MessageLike"("accountId");

ALTER TABLE "MessageLike"
  ADD CONSTRAINT "MessageLike_messageId_fkey" FOREIGN KEY ("messageId")
  REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageLike"
  ADD CONSTRAINT "MessageLike_accountId_fkey" FOREIGN KEY ("accountId")
  REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
