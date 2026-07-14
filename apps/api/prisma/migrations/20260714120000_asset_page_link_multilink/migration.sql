-- CS-3 (2026-07-14) Multi-card linking: replace the single Asset.linkedPageId FK with an
-- AssetPageLink many-to-many join. ORDER MATTERS: create the join table + backfill existing
-- links FIRST, then drop the old column/index/FK (the backfill reads linkedPageId).

-- CreateTable
CREATE TABLE "AssetPageLink" (
    "assetId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPageLink_pkey" PRIMARY KEY ("assetId","pageId")
);

-- CreateIndex
CREATE INDEX "AssetPageLink_pageId_idx" ON "AssetPageLink"("pageId");

-- AddForeignKey
ALTER TABLE "AssetPageLink" ADD CONSTRAINT "AssetPageLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPageLink" ADD CONSTRAINT "AssetPageLink_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single links into the join (BEFORE the column is dropped).
INSERT INTO "AssetPageLink" ("assetId", "pageId")
SELECT "id", "linkedPageId" FROM "Asset" WHERE "linkedPageId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_linkedPageId_fkey";

-- DropIndex
DROP INDEX "Asset_linkedPageId_idx";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "linkedPageId";
