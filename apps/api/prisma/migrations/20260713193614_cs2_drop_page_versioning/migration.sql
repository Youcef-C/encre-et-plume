-- CS-2 (post-CS-3): drop the interim card-level versioning. CS-3's Asset/AssetVersion owns
-- per-file versioning now; the card badge is a derived rollup of linked-asset versions.

-- DropForeignKey
ALTER TABLE "PageVersion" DROP CONSTRAINT "PageVersion_pageId_fkey";

-- DropTable
DROP TABLE "PageVersion";

-- AlterTable
ALTER TABLE "Page" DROP COLUMN "version";
