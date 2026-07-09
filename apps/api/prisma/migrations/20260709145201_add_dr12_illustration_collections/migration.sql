-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "contestId" TEXT,
ADD COLUMN     "soutien" JSONB;

-- CreateTable
CREATE TABLE "IllustrationCollection" (
    "illustrationId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IllustrationCollection_pkey" PRIMARY KEY ("illustrationId","workId")
);

-- CreateIndex
CREATE INDEX "IllustrationCollection_workId_order_idx" ON "IllustrationCollection"("workId", "order");

-- AddForeignKey
ALTER TABLE "IllustrationCollection" ADD CONSTRAINT "IllustrationCollection_illustrationId_fkey" FOREIGN KEY ("illustrationId") REFERENCES "Illustration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IllustrationCollection" ADD CONSTRAINT "IllustrationCollection_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
