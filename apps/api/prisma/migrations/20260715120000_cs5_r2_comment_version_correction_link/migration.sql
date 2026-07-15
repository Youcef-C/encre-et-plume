-- CS-5 r2: comment version + scenario correction ⇄ comment 1:1 link.

-- AlterTable: the asset version a scenario comment was filed against (Fb-7). Null for legacy rows.
ALTER TABLE "ScenarioComment" ADD COLUMN "version" INTEGER;

-- AlterTable: 1:1 link from a scenario correction to its backing CS-4 comment (Fb-2). Deleting the
-- comment cascades the correction.
ALTER TABLE "Correction" ADD COLUMN "commentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Correction_commentId_key" ON "Correction"("commentId");

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ScenarioComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
