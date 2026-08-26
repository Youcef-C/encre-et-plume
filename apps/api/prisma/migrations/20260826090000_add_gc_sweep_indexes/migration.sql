-- F-25 — indexes the nightly retention sweeps run on.
--
-- Four of the five sweeps filter on a column that carried no index: the three token models were
-- indexed on accountId only, Notification on (recipientId, …) / sourceUserId, ScenarioUpdate on
-- (documentId, createdAt). A GLOBAL sweep filtering on expiresAt / createdAt alone cannot use a
-- composite whose leading column it does not constrain, so each pass would sequentially scan the
-- largest tables in the schema, every night. DataExport already has @@index([status, expiresAt])
-- and Media @@index([status, createdAt]) — those two sweeps were already covered.
--
-- Plain CREATE INDEX, not CONCURRENTLY: Prisma runs each migration in a transaction.
-- No column, no model, no data change.

CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "EmailChangeToken_expiresAt_idx" ON "EmailChangeToken"("expiresAt");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "ScenarioUpdate_createdAt_idx" ON "ScenarioUpdate"("createdAt");
