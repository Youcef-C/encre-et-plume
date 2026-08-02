-- DB scalability pass, 2026-08-02 — index every foreign key.
--
-- Postgres does NOT index a foreign key automatically, and all three delete actions in use here
-- (RESTRICT, SET NULL, CASCADE) require it to find the child rows when a parent is deleted or its key
-- updated. Unindexed, each of those is a SEQUENTIAL SCAN of the child table.
--
-- That is not theoretical: F-14 RGPD account erasure touches ~10 of these tables, CS-16 project delete
-- hits Invitation/ProjectCall, and deleting a Work hits Favorite/WatchlistItem/ReadingProgress/
-- EditorPick. With statement_timeout now set to 30s, at volume those operations would not merely be
-- slow, they would FAIL.
--
-- Plain CREATE INDEX, not CONCURRENTLY: Prisma runs each migration in a transaction, and CONCURRENTLY
-- cannot. On a table large enough for the write lock to matter, build the index out-of-band instead.

CREATE INDEX "AssetVersion_authorId_idx" ON "AssetVersion"("authorId");
CREATE INDEX "Correction_authorId_idx" ON "Correction"("authorId");
CREATE INDEX "EditorPick_workId_idx" ON "EditorPick"("workId");
CREATE INDEX "Favorite_workId_idx" ON "Favorite"("workId");
CREATE INDEX "Illustration_artistId_idx" ON "Illustration"("artistId");
CREATE INDEX "Invitation_projectId_idx" ON "Invitation"("projectId");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX "Notification_sourceUserId_idx" ON "Notification"("sourceUserId");
CREATE INDEX "PageAssignee_userId_idx" ON "PageAssignee"("userId");
CREATE INDEX "PageComment_authorId_idx" ON "PageComment"("authorId");
CREATE INDEX "PageLabel_labelId_idx" ON "PageLabel"("labelId");
CREATE INDEX "PortfolioItem_profileId_idx" ON "PortfolioItem"("profileId");
CREATE INDEX "ProjectCall_projectId_idx" ON "ProjectCall"("projectId");
CREATE INDEX "ReadingProgress_chapterId_idx" ON "ReadingProgress"("chapterId");
CREATE INDEX "ReadingProgress_workId_idx" ON "ReadingProgress"("workId");
CREATE INDEX "ScenarioComment_authorId_idx" ON "ScenarioComment"("authorId");
CREATE INDEX "WatchlistItem_workId_idx" ON "WatchlistItem"("workId");
CREATE INDEX "WorkCreator_accountId_idx" ON "WorkCreator"("accountId");
