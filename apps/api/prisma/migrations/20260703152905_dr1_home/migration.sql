-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('draft', 'scheduled', 'published');

-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('concours', 'a_chaud', 'evenement');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "trendingScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverImage" TEXT,
    "genre" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "weeklyLikeDelta" INTEGER NOT NULL DEFAULT 0,
    "priorWeekLikeDelta" INTEGER NOT NULL DEFAULT 0,
    "featuredRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "status" "ChapterStatus" NOT NULL DEFAULT 'published',
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Work_slug_key" ON "Work"("slug");

-- CreateIndex
CREATE INDEX "Work_featuredRank_idx" ON "Work"("featuredRank");

-- CreateIndex
CREATE INDEX "Work_weeklyLikeDelta_idx" ON "Work"("weeklyLikeDelta");

-- CreateIndex
CREATE INDEX "Work_likeCount_idx" ON "Work"("likeCount");

-- CreateIndex
CREATE INDEX "Chapter_status_publishAt_idx" ON "Chapter"("status", "publishAt");

-- CreateIndex
CREATE INDEX "Chapter_workId_number_idx" ON "Chapter"("workId", "number");

-- CreateIndex
CREATE INDEX "Announcement_order_idx" ON "Announcement"("order");

-- CreateIndex
CREATE INDEX "Profile_trendingScore_idx" ON "Profile"("trendingScore");

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

