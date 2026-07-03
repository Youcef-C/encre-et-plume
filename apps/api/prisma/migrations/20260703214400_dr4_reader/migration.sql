-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN     "premium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prose" TEXT;

-- AlterTable
ALTER TABLE "Planche" ADD COLUMN     "chapterId" TEXT;

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favorite_accountId_idx" ON "Favorite"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_accountId_workId_key" ON "Favorite"("accountId", "workId");

-- CreateIndex
CREATE INDEX "ReadingProgress_accountId_updatedAt_idx" ON "ReadingProgress"("accountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReadingProgress_accountId_chapterId_key" ON "ReadingProgress"("accountId", "chapterId");

-- CreateIndex
CREATE INDEX "Planche_chapterId_order_idx" ON "Planche"("chapterId", "order");

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

