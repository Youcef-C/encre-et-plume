-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plancheCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "favoriteCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "proseExcerpt" TEXT,
ADD COLUMN     "ratingArtAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingStoryAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "readCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "synopsis" TEXT;

-- CreateTable
CREATE TABLE "WorkCreator" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planche" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "image" TEXT,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Planche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingGoal" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentCents" INTEGER NOT NULL DEFAULT 0,
    "targetCents" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FundingGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "storyRating" INTEGER NOT NULL,
    "artRating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkCreator_workId_accountId_key" ON "WorkCreator"("workId", "accountId");

-- CreateIndex
CREATE INDEX "Planche_workId_order_idx" ON "Planche"("workId", "order");

-- CreateIndex
CREATE INDEX "FundingGoal_workId_order_idx" ON "FundingGoal"("workId", "order");

-- CreateIndex
CREATE INDEX "Review_workId_createdAt_idx" ON "Review"("workId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkCreator" ADD CONSTRAINT "WorkCreator_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCreator" ADD CONSTRAINT "WorkCreator_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planche" ADD CONSTRAINT "Planche_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingGoal" ADD CONSTRAINT "FundingGoal_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

