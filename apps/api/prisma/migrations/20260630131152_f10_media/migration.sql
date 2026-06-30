-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('avatar', 'cover', 'portfolio', 'chapter_page', 'illustration', 'attachment', 'article', 'contest');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('public', 'private');

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'pending',
    "variants" JSONB NOT NULL DEFAULT '{}',
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_ownerId_idx" ON "Media"("ownerId");

-- CreateIndex
CREATE INDEX "Media_status_createdAt_idx" ON "Media"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
