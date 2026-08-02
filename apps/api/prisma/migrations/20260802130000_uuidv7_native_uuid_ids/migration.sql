-- ─────────────────────────────────────────────────────────────────────────────
-- Primary keys: cuid stored as TEXT  →  UUIDv7 stored as native `uuid` (16 B).
--
-- v7 is time-ordered, so inserts land at the right edge of the B-tree instead of
-- scattering the way a v4 would; native `uuid` halves every key and index entry
-- versus the 25-char cuid TEXT. Every FK to one of these keys moves with it —
-- a split TEXT/uuid id strategy would be worse than either pure choice.
--
-- DESTRUCTIVE BY DESIGN. A cuid has no cast to `uuid`, so each id column is
-- dropped and recreated; the data was local-only dev/seed data and is recreated
-- by `prisma db seed`. The truncate below makes that explicit (and makes the
-- migration replayable on a populated dev DB, where `ADD COLUMN … NOT NULL`
-- would otherwise fail on existing rows).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
  END LOOP;
END $$;

/*
  Warnings:

  - The primary key for the `Account` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Announcement` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Application` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ApplicationAsset` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `mediaId` column on the `ApplicationAsset` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `portfolioItemId` column on the `ApplicationAsset` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Asset` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `AssetPageLink` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `AssetVersion` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Chapter` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Connection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ConsentRecord` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Contest` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Conversation` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `projectId` column on the `Conversation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `requestedBy` column on the `Conversation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `createdBy` column on the `Conversation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ConversationParticipant` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Correction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `assigneeId` column on the `Correction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `commentId` column on the `Correction` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `DataExport` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `mediaId` column on the `DataExport` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `EditorPick` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `EmailChangeToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `EmailVerificationToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Favorite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `FundingGoal` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Illustration` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `artistId` column on the `Illustration` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `contestId` column on the `Illustration` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `IllustrationCollection` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Invitation` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `projectId` column on the `Invitation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `LegalDocument` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Media` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Message` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `attachmentIds` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `replyToId` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `MessageLike` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Notification` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `refId` column on the `Notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `sourceUserId` column on the `Notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `NotificationPreference` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Page` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `linkedFileIds` column on the `Page` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `createdById` column on the `Page` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `PageAssignee` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `PageChecklistItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `PageComment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `PageLabel` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `PasswordResetToken` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Planche` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `chapterId` column on the `Planche` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `PortfolioItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Profile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Project` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProjectCall` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `authorId` column on the `ProjectCall` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `projectId` column on the `ProjectCall` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ProjectCallAsset` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ProjectLabel` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Reaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ReadingProgress` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Review` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `authorId` column on the `Review` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ScenarioComment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ScenarioDocument` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ScenarioUpdate` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `SupportTicket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `accountId` column on the `SupportTicket` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `TwoFactorCredential` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `UserBlock` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `WatchlistItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Work` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `contestId` column on the `Work` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `WorkCreator` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `Account` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Announcement` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Application` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `callId` on the `Application` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `applicantId` on the `Application` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `applicationId` on the `ApplicationAsset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Asset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `projectId` on the `Asset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `mediaId` on the `Asset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `assetId` on the `AssetPageLink` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `AssetPageLink` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `AssetVersion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `assetId` on the `AssetVersion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `mediaId` on the `AssetVersion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `authorId` on the `AssetVersion` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Chapter` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `Chapter` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Connection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `requesterId` on the `Connection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `addresseeId` on the `Connection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ConsentRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `ConsentRecord` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Contest` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Conversation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `conversationId` on the `ConversationParticipant` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `ConversationParticipant` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Correction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `Correction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `assetId` on the `Correction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `authorId` on the `Correction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `DataExport` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `DataExport` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `EditorPick` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `EditorPick` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `EmailChangeToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `EmailChangeToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `EmailVerificationToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `EmailVerificationToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Favorite` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `Favorite` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `Favorite` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `FundingGoal` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `FundingGoal` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Illustration` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `illustrationId` on the `IllustrationCollection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `IllustrationCollection` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `fromUserId` on the `Invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `toUserId` on the `Invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `LegalDocument` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Media` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `ownerId` on the `Media` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `conversationId` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `senderId` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `messageId` on the `MessageLike` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `MessageLike` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `recipientId` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `NotificationPreference` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `NotificationPreference` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Page` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `projectId` on the `Page` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `chapterId` on the `Page` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `PageAssignee` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `PageAssignee` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `PageChecklistItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `PageChecklistItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `PageComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `PageComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `authorId` on the `PageComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `pageId` on the `PageLabel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `labelId` on the `PageLabel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `PasswordResetToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `PasswordResetToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Planche` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `Planche` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `PortfolioItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `profileId` on the `PortfolioItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Profile` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `Profile` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Project` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `ownerId` on the `Project` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `Project` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ProjectCall` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `callId` on the `ProjectCallAsset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `mediaId` on the `ProjectCallAsset` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ProjectLabel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `projectId` on the `ProjectLabel` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Reaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `Reaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `targetId` on the `Reaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ReadingProgress` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `ReadingProgress` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `chapterId` on the `ReadingProgress` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `ReadingProgress` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Review` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `Review` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ScenarioComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `documentId` on the `ScenarioComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `authorId` on the `ScenarioComment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ScenarioDocument` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `assetId` on the `ScenarioDocument` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `ScenarioUpdate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `documentId` on the `ScenarioUpdate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `SupportTicket` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `TwoFactorCredential` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `TwoFactorCredential` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `UserBlock` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `blockerId` on the `UserBlock` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `blockedId` on the `UserBlock` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `WatchlistItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `WatchlistItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `WatchlistItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Work` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `WorkCreator` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `workId` on the `WorkCreator` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `WorkCreator` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_applicantId_fkey";

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_callId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationAsset" DROP CONSTRAINT "ApplicationAsset_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_projectId_fkey";

-- DropForeignKey
ALTER TABLE "AssetPageLink" DROP CONSTRAINT "AssetPageLink_assetId_fkey";

-- DropForeignKey
ALTER TABLE "AssetPageLink" DROP CONSTRAINT "AssetPageLink_pageId_fkey";

-- DropForeignKey
ALTER TABLE "AssetVersion" DROP CONSTRAINT "AssetVersion_assetId_fkey";

-- DropForeignKey
ALTER TABLE "AssetVersion" DROP CONSTRAINT "AssetVersion_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Chapter" DROP CONSTRAINT "Chapter_workId_fkey";

-- DropForeignKey
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_addresseeId_fkey";

-- DropForeignKey
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "Correction" DROP CONSTRAINT "Correction_assetId_fkey";

-- DropForeignKey
ALTER TABLE "Correction" DROP CONSTRAINT "Correction_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Correction" DROP CONSTRAINT "Correction_commentId_fkey";

-- DropForeignKey
ALTER TABLE "Correction" DROP CONSTRAINT "Correction_pageId_fkey";

-- DropForeignKey
ALTER TABLE "DataExport" DROP CONSTRAINT "DataExport_accountId_fkey";

-- DropForeignKey
ALTER TABLE "DataExport" DROP CONSTRAINT "DataExport_mediaId_fkey";

-- DropForeignKey
ALTER TABLE "EditorPick" DROP CONSTRAINT "EditorPick_workId_fkey";

-- DropForeignKey
ALTER TABLE "EmailChangeToken" DROP CONSTRAINT "EmailChangeToken_accountId_fkey";

-- DropForeignKey
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_workId_fkey";

-- DropForeignKey
ALTER TABLE "FundingGoal" DROP CONSTRAINT "FundingGoal_workId_fkey";

-- DropForeignKey
ALTER TABLE "Illustration" DROP CONSTRAINT "Illustration_artistId_fkey";

-- DropForeignKey
ALTER TABLE "IllustrationCollection" DROP CONSTRAINT "IllustrationCollection_illustrationId_fkey";

-- DropForeignKey
ALTER TABLE "IllustrationCollection" DROP CONSTRAINT "IllustrationCollection_workId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_fromUserId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_toUserId_fkey";

-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_replyToId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderId_fkey";

-- DropForeignKey
ALTER TABLE "MessageLike" DROP CONSTRAINT "MessageLike_accountId_fkey";

-- DropForeignKey
ALTER TABLE "MessageLike" DROP CONSTRAINT "MessageLike_messageId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_sourceUserId_fkey";

-- DropForeignKey
ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_projectId_fkey";

-- DropForeignKey
ALTER TABLE "PageAssignee" DROP CONSTRAINT "PageAssignee_pageId_fkey";

-- DropForeignKey
ALTER TABLE "PageAssignee" DROP CONSTRAINT "PageAssignee_userId_fkey";

-- DropForeignKey
ALTER TABLE "PageChecklistItem" DROP CONSTRAINT "PageChecklistItem_pageId_fkey";

-- DropForeignKey
ALTER TABLE "PageComment" DROP CONSTRAINT "PageComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "PageComment" DROP CONSTRAINT "PageComment_pageId_fkey";

-- DropForeignKey
ALTER TABLE "PageLabel" DROP CONSTRAINT "PageLabel_labelId_fkey";

-- DropForeignKey
ALTER TABLE "PageLabel" DROP CONSTRAINT "PageLabel_pageId_fkey";

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Planche" DROP CONSTRAINT "Planche_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "Planche" DROP CONSTRAINT "Planche_workId_fkey";

-- DropForeignKey
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_profileId_fkey";

-- DropForeignKey
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_workId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCall" DROP CONSTRAINT "ProjectCall_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectCallAsset" DROP CONSTRAINT "ProjectCallAsset_callId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectLabel" DROP CONSTRAINT "ProjectLabel_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_accountId_fkey";

-- DropForeignKey
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_chapterId_fkey";

-- DropForeignKey
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_workId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_workId_fkey";

-- DropForeignKey
ALTER TABLE "ScenarioComment" DROP CONSTRAINT "ScenarioComment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "ScenarioComment" DROP CONSTRAINT "ScenarioComment_documentId_fkey";

-- DropForeignKey
ALTER TABLE "ScenarioDocument" DROP CONSTRAINT "ScenarioDocument_assetId_fkey";

-- DropForeignKey
ALTER TABLE "ScenarioUpdate" DROP CONSTRAINT "ScenarioUpdate_documentId_fkey";

-- DropForeignKey
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_accountId_fkey";

-- DropForeignKey
ALTER TABLE "TwoFactorCredential" DROP CONSTRAINT "TwoFactorCredential_accountId_fkey";

-- DropForeignKey
ALTER TABLE "UserBlock" DROP CONSTRAINT "UserBlock_blockedId_fkey";

-- DropForeignKey
ALTER TABLE "UserBlock" DROP CONSTRAINT "UserBlock_blockerId_fkey";

-- DropForeignKey
ALTER TABLE "WatchlistItem" DROP CONSTRAINT "WatchlistItem_accountId_fkey";

-- DropForeignKey
ALTER TABLE "WatchlistItem" DROP CONSTRAINT "WatchlistItem_workId_fkey";

-- DropForeignKey
ALTER TABLE "WorkCreator" DROP CONSTRAINT "WorkCreator_accountId_fkey";

-- DropForeignKey
ALTER TABLE "WorkCreator" DROP CONSTRAINT "WorkCreator_workId_fkey";

-- AlterTable
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Application" DROP CONSTRAINT "Application_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "callId",
ADD COLUMN     "callId" UUID NOT NULL,
DROP COLUMN "applicantId",
ADD COLUMN     "applicantId" UUID NOT NULL,
ADD CONSTRAINT "Application_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ApplicationAsset" DROP CONSTRAINT "ApplicationAsset_pkey",
DROP COLUMN "applicationId",
ADD COLUMN     "applicationId" UUID NOT NULL,
DROP COLUMN "mediaId",
ADD COLUMN     "mediaId" UUID,
DROP COLUMN "portfolioItemId",
ADD COLUMN     "portfolioItemId" UUID,
ADD CONSTRAINT "ApplicationAsset_pkey" PRIMARY KEY ("applicationId", "position");

-- AlterTable
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "mediaId",
ADD COLUMN     "mediaId" UUID NOT NULL,
ADD CONSTRAINT "Asset_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "AssetPageLink" DROP CONSTRAINT "AssetPageLink_pkey",
DROP COLUMN "assetId",
ADD COLUMN     "assetId" UUID NOT NULL,
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
ADD CONSTRAINT "AssetPageLink_pkey" PRIMARY KEY ("assetId", "pageId");

-- AlterTable
ALTER TABLE "AssetVersion" DROP CONSTRAINT "AssetVersion_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "assetId",
ADD COLUMN     "assetId" UUID NOT NULL,
DROP COLUMN "mediaId",
ADD COLUMN     "mediaId" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID NOT NULL,
ADD CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Chapter" DROP CONSTRAINT "Chapter_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "requesterId",
ADD COLUMN     "requesterId" UUID NOT NULL,
DROP COLUMN "addresseeId",
ADD COLUMN     "addresseeId" UUID NOT NULL,
ADD CONSTRAINT "Connection_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Contest" DROP CONSTRAINT "Contest_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Contest_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID,
DROP COLUMN "requestedBy",
ADD COLUMN     "requestedBy" UUID,
DROP COLUMN "createdBy",
ADD COLUMN     "createdBy" UUID,
ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ConversationParticipant" DROP CONSTRAINT "ConversationParticipant_pkey",
DROP COLUMN "conversationId",
ADD COLUMN     "conversationId" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId", "accountId");

-- AlterTable
ALTER TABLE "Correction" DROP CONSTRAINT "Correction_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
DROP COLUMN "assetId",
ADD COLUMN     "assetId" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID NOT NULL,
DROP COLUMN "assigneeId",
ADD COLUMN     "assigneeId" UUID,
DROP COLUMN "commentId",
ADD COLUMN     "commentId" UUID,
ADD CONSTRAINT "Correction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "DataExport" DROP CONSTRAINT "DataExport_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "mediaId",
ADD COLUMN     "mediaId" UUID,
ADD CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EditorPick" DROP CONSTRAINT "EditorPick_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "EditorPick_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EmailChangeToken" DROP CONSTRAINT "EmailChangeToken_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "EmailChangeToken_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "EmailVerificationToken" DROP CONSTRAINT "EmailVerificationToken_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "FundingGoal" DROP CONSTRAINT "FundingGoal_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "FundingGoal_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Illustration" DROP CONSTRAINT "Illustration_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "artistId",
ADD COLUMN     "artistId" UUID,
DROP COLUMN "contestId",
ADD COLUMN     "contestId" UUID,
ADD CONSTRAINT "Illustration_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "IllustrationCollection" DROP CONSTRAINT "IllustrationCollection_pkey",
DROP COLUMN "illustrationId",
ADD COLUMN     "illustrationId" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "IllustrationCollection_pkey" PRIMARY KEY ("illustrationId", "workId");

-- AlterTable
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "fromUserId",
ADD COLUMN     "fromUserId" UUID NOT NULL,
DROP COLUMN "toUserId",
ADD COLUMN     "toUserId" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID,
ADD CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "LegalDocument" DROP CONSTRAINT "LegalDocument_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Media" DROP CONSTRAINT "Media_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "ownerId",
ADD COLUMN     "ownerId" UUID NOT NULL,
ADD CONSTRAINT "Media_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Message" DROP CONSTRAINT "Message_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "conversationId",
ADD COLUMN     "conversationId" UUID NOT NULL,
DROP COLUMN "senderId",
ADD COLUMN     "senderId" UUID NOT NULL,
DROP COLUMN "attachmentIds",
ADD COLUMN     "attachmentIds" UUID[] DEFAULT ARRAY[]::UUID[],
DROP COLUMN "replyToId",
ADD COLUMN     "replyToId" UUID,
ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "MessageLike" DROP CONSTRAINT "MessageLike_pkey",
DROP COLUMN "messageId",
ADD COLUMN     "messageId" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "MessageLike_pkey" PRIMARY KEY ("messageId", "accountId");

-- AlterTable
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "recipientId",
ADD COLUMN     "recipientId" UUID NOT NULL,
DROP COLUMN "refId",
ADD COLUMN     "refId" UUID,
DROP COLUMN "sourceUserId",
ADD COLUMN     "sourceUserId" UUID,
ADD CONSTRAINT "Notification_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "NotificationPreference" DROP CONSTRAINT "NotificationPreference_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Page" DROP CONSTRAINT "Page_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "chapterId",
ADD COLUMN     "chapterId" UUID NOT NULL,
DROP COLUMN "linkedFileIds",
ADD COLUMN     "linkedFileIds" UUID[] DEFAULT ARRAY[]::UUID[],
DROP COLUMN "createdById",
ADD COLUMN     "createdById" UUID,
ADD CONSTRAINT "Page_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "PageAssignee" DROP CONSTRAINT "PageAssignee_pkey",
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "PageAssignee_pkey" PRIMARY KEY ("pageId", "userId");

-- AlterTable
ALTER TABLE "PageChecklistItem" DROP CONSTRAINT "PageChecklistItem_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
ADD CONSTRAINT "PageChecklistItem_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "PageComment" DROP CONSTRAINT "PageComment_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID NOT NULL,
ADD CONSTRAINT "PageComment_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "PageLabel" DROP CONSTRAINT "PageLabel_pkey",
DROP COLUMN "pageId",
ADD COLUMN     "pageId" UUID NOT NULL,
DROP COLUMN "labelId",
ADD COLUMN     "labelId" UUID NOT NULL,
ADD CONSTRAINT "PageLabel_pkey" PRIMARY KEY ("pageId", "labelId");

-- AlterTable
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Planche" DROP CONSTRAINT "Planche_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
DROP COLUMN "chapterId",
ADD COLUMN     "chapterId" UUID,
ADD CONSTRAINT "Planche_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "PortfolioItem" DROP CONSTRAINT "PortfolioItem_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "profileId",
ADD COLUMN     "profileId" UUID NOT NULL,
ADD CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "Profile_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Project" DROP CONSTRAINT "Project_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "ownerId",
ADD COLUMN     "ownerId" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProjectCall" DROP CONSTRAINT "ProjectCall_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID,
ADD CONSTRAINT "ProjectCall_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProjectCallAsset" DROP CONSTRAINT "ProjectCallAsset_pkey",
DROP COLUMN "callId",
ADD COLUMN     "callId" UUID NOT NULL,
DROP COLUMN "mediaId",
ADD COLUMN     "mediaId" UUID NOT NULL,
ADD CONSTRAINT "ProjectCallAsset_pkey" PRIMARY KEY ("callId", "mediaId");

-- AlterTable
ALTER TABLE "ProjectLabel" DROP CONSTRAINT "ProjectLabel_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
ADD CONSTRAINT "ProjectLabel_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "targetId",
ADD COLUMN     "targetId" UUID NOT NULL,
ADD CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ReadingProgress" DROP CONSTRAINT "ReadingProgress_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "chapterId",
ADD COLUMN     "chapterId" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Review" DROP CONSTRAINT "Review_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID,
ADD CONSTRAINT "Review_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ScenarioComment" DROP CONSTRAINT "ScenarioComment_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "documentId",
ADD COLUMN     "documentId" UUID NOT NULL,
DROP COLUMN "authorId",
ADD COLUMN     "authorId" UUID NOT NULL,
ADD CONSTRAINT "ScenarioComment_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ScenarioDocument" DROP CONSTRAINT "ScenarioDocument_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "assetId",
ADD COLUMN     "assetId" UUID NOT NULL,
ADD CONSTRAINT "ScenarioDocument_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ScenarioUpdate" DROP CONSTRAINT "ScenarioUpdate_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "documentId",
ADD COLUMN     "documentId" UUID NOT NULL,
ADD CONSTRAINT "ScenarioUpdate_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SupportTicket" DROP CONSTRAINT "SupportTicket_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID,
ADD CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "TwoFactorCredential" DROP CONSTRAINT "TwoFactorCredential_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "TwoFactorCredential_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "UserBlock" DROP CONSTRAINT "UserBlock_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "blockerId",
ADD COLUMN     "blockerId" UUID NOT NULL,
DROP COLUMN "blockedId",
ADD COLUMN     "blockedId" UUID NOT NULL,
ADD CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "WatchlistItem" DROP CONSTRAINT "WatchlistItem_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
ADD CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Work" DROP CONSTRAINT "Work_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "contestId",
ADD COLUMN     "contestId" UUID,
ADD CONSTRAINT "Work_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "WorkCreator" DROP CONSTRAINT "WorkCreator_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "workId",
ADD COLUMN     "workId" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
ADD CONSTRAINT "WorkCreator_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "Application_applicantId_createdAt_idx" ON "Application"("applicantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_callId_applicantId_key" ON "Application"("callId", "applicantId");

-- CreateIndex
CREATE INDEX "ApplicationAsset_applicationId_idx" ON "ApplicationAsset"("applicationId");

-- CreateIndex
CREATE INDEX "Asset_projectId_type_idx" ON "Asset"("projectId", "type");

-- CreateIndex
CREATE INDEX "Asset_projectId_updatedAt_idx" ON "Asset"("projectId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_projectId_filename_key" ON "Asset"("projectId", "filename");

-- CreateIndex
CREATE INDEX "AssetPageLink_pageId_idx" ON "AssetPageLink"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_version_key" ON "AssetVersion"("assetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_workId_number_key" ON "Chapter"("workId", "number");

-- CreateIndex
CREATE INDEX "Connection_addresseeId_status_idx" ON "Connection"("addresseeId", "status");

-- CreateIndex
CREATE INDEX "Connection_requesterId_status_idx" ON "Connection"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_requesterId_addresseeId_key" ON "Connection"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "ConsentRecord_accountId_document_idx" ON "ConsentRecord"("accountId", "document");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_projectId_key" ON "Conversation"("projectId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_accountId_idx" ON "ConversationParticipant"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Correction_commentId_key" ON "Correction"("commentId");

-- CreateIndex
CREATE INDEX "Correction_pageId_type_status_createdAt_idx" ON "Correction"("pageId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Correction_assetId_status_idx" ON "Correction"("assetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DataExport_mediaId_key" ON "DataExport"("mediaId");

-- CreateIndex
CREATE INDEX "DataExport_accountId_status_idx" ON "DataExport"("accountId", "status");

-- CreateIndex
CREATE INDEX "EmailChangeToken_accountId_idx" ON "EmailChangeToken"("accountId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_accountId_idx" ON "EmailVerificationToken"("accountId");

-- CreateIndex
CREATE INDEX "Favorite_accountId_idx" ON "Favorite"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_accountId_workId_key" ON "Favorite"("accountId", "workId");

-- CreateIndex
CREATE INDEX "FundingGoal_workId_order_idx" ON "FundingGoal"("workId", "order");

-- CreateIndex
CREATE INDEX "IllustrationCollection_workId_order_idx" ON "IllustrationCollection"("workId", "order");

-- CreateIndex
CREATE INDEX "Invitation_fromUserId_status_idx" ON "Invitation"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "Invitation_toUserId_status_idx" ON "Invitation"("toUserId", "status");

-- CreateIndex
CREATE INDEX "Media_ownerId_idx" ON "Media"("ownerId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");

-- CreateIndex
CREATE INDEX "MessageLike_accountId_idx" ON "MessageLike"("accountId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_accountId_idx" ON "NotificationPreference"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_accountId_type_channel_key" ON "NotificationPreference"("accountId", "type", "channel");

-- CreateIndex
CREATE INDEX "Page_projectId_chapterId_stage_idx" ON "Page"("projectId", "chapterId", "stage");

-- CreateIndex
CREATE INDEX "Page_createdById_idx" ON "Page"("createdById");

-- CreateIndex
CREATE INDEX "Page_chapterId_position_idx" ON "Page"("chapterId", "position");

-- CreateIndex
CREATE INDEX "PageChecklistItem_pageId_order_idx" ON "PageChecklistItem"("pageId", "order");

-- CreateIndex
CREATE INDEX "PageComment_pageId_createdAt_idx" ON "PageComment"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_accountId_idx" ON "PasswordResetToken"("accountId");

-- CreateIndex
CREATE INDEX "Planche_workId_order_idx" ON "Planche"("workId", "order");

-- CreateIndex
CREATE INDEX "Planche_chapterId_order_idx" ON "Planche"("chapterId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_accountId_key" ON "Profile"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workId_key" ON "Project"("workId");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "ProjectCall_authorId_idx" ON "ProjectCall"("authorId");

-- CreateIndex
CREATE INDEX "ProjectCallAsset_callId_position_idx" ON "ProjectCallAsset"("callId", "position");

-- CreateIndex
CREATE INDEX "ProjectLabel_projectId_idx" ON "ProjectLabel"("projectId");

-- CreateIndex
CREATE INDEX "Reaction_targetType_targetId_kind_idx" ON "Reaction"("targetType", "targetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_accountId_targetType_targetId_kind_key" ON "Reaction"("accountId", "targetType", "targetId", "kind");

-- CreateIndex
CREATE INDEX "ReadingProgress_accountId_updatedAt_idx" ON "ReadingProgress"("accountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_accountId_chapterId_key" ON "ReadingProgress"("accountId", "chapterId");

-- CreateIndex
CREATE INDEX "Review_workId_createdAt_idx" ON "Review"("workId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioComment_documentId_caseNo_createdAt_idx" ON "ScenarioComment"("documentId", "caseNo", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioDocument_assetId_key" ON "ScenarioDocument"("assetId");

-- CreateIndex
CREATE INDEX "ScenarioUpdate_documentId_createdAt_idx" ON "ScenarioUpdate"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_accountId_idx" ON "SupportTicket"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorCredential_accountId_key" ON "TwoFactorCredential"("accountId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_kind_key" ON "UserBlock"("blockerId", "blockedId", "kind");

-- CreateIndex
CREATE INDEX "WatchlistItem_accountId_createdAt_idx" ON "WatchlistItem"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_accountId_workId_key" ON "WatchlistItem"("accountId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCreator_workId_accountId_key" ON "WorkCreator"("workId", "accountId");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLike" ADD CONSTRAINT "MessageLike_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLike" ADD CONSTRAINT "MessageLike_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorCredential" ADD CONSTRAINT "TwoFactorCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChangeToken" ADD CONSTRAINT "EmailChangeToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCreator" ADD CONSTRAINT "WorkCreator_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCreator" ADD CONSTRAINT "WorkCreator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planche" ADD CONSTRAINT "Planche_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planche" ADD CONSTRAINT "Planche_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingGoal" ADD CONSTRAINT "FundingGoal_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCall" ADD CONSTRAINT "ProjectCall_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCallAsset" ADD CONSTRAINT "ProjectCallAsset_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ProjectCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ProjectCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorPick" ADD CONSTRAINT "EditorPick_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Illustration" ADD CONSTRAINT "Illustration_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IllustrationCollection" ADD CONSTRAINT "IllustrationCollection_illustrationId_fkey" FOREIGN KEY ("illustrationId") REFERENCES "Illustration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IllustrationCollection" ADD CONSTRAINT "IllustrationCollection_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLabel" ADD CONSTRAINT "ProjectLabel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageLabel" ADD CONSTRAINT "PageLabel_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageLabel" ADD CONSTRAINT "PageLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "ProjectLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAssignee" ADD CONSTRAINT "PageAssignee_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageAssignee" ADD CONSTRAINT "PageAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageChecklistItem" ADD CONSTRAINT "PageChecklistItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageComment" ADD CONSTRAINT "PageComment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageComment" ADD CONSTRAINT "PageComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPageLink" ADD CONSTRAINT "AssetPageLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPageLink" ADD CONSTRAINT "AssetPageLink_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioDocument" ADD CONSTRAINT "ScenarioDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioUpdate" ADD CONSTRAINT "ScenarioUpdate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ScenarioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComment" ADD CONSTRAINT "ScenarioComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ScenarioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComment" ADD CONSTRAINT "ScenarioComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ScenarioComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The three legal documents inserted by 20260702185005_f13_legal_consent were truncated above.
-- Re-seeded here with fixed UUIDv7 ids so a fresh `migrate deploy` still ends with /cgu, /confidentialite
-- and /mentions-legales served (nothing references these ids by value).
INSERT INTO "LegalDocument" ("id","kind","version","content","publishedAt") VALUES
  ('00000000-0000-7000-8000-00000000f131','cgu','1.0','<h1>Conditions générales d''utilisation</h1><p>[Contenu juridique à valider par l''équipe]</p>', now()),
  ('00000000-0000-7000-8000-00000000f132','privacy','1.0','<h1>Politique de confidentialité</h1><p>[Contenu juridique à valider par l''équipe]</p>', now()),
  ('00000000-0000-7000-8000-00000000f133','mentions','1.0','<h1>Mentions légales</h1><p>[Contenu juridique à valider par l''équipe]</p>', now())
ON CONFLICT ("kind","version") DO NOTHING;
