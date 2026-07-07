-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'application_sample';

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "sampleMediaId" TEXT,
    "samplePortfolioItemId" TEXT,
    "sampleUrl" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_applicantId_createdAt_idx" ON "Application"("applicantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_callId_applicantId_key" ON "Application"("callId", "applicantId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ProjectCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

