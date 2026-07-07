-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "availability" TEXT NOT NULL DEFAULT 'ouvert',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'Europe';

-- CreateTable
CREATE TABLE "ProjectCall" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "seekingRole" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "closesAt" TIMESTAMP(3),
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCall_status_createdAt_idx" ON "ProjectCall"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Profile_region_idx" ON "Profile"("region");
