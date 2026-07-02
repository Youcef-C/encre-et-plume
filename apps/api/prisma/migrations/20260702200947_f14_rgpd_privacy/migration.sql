-- CreateEnum
CREATE TYPE "DataExportStatus" AS ENUM ('pending', 'ready', 'failed', 'expired');

-- AlterEnum
ALTER TYPE "NotifType" ADD VALUE 'system';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'pending',
    "mediaId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataExport_mediaId_key" ON "DataExport"("mediaId");

-- CreateIndex
CREATE INDEX "DataExport_accountId_status_idx" ON "DataExport"("accountId", "status");

-- CreateIndex
CREATE INDEX "DataExport_status_expiresAt_idx" ON "DataExport"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
