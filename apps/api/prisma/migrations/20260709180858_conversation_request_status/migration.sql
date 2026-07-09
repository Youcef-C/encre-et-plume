-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';
