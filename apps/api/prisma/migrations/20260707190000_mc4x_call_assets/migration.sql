-- MC-4X: multi-sample calls + multi-sample applications + PDF document kinds.
-- Hand-edited order (mandatory): add enum values → create join tables → BACKFILL the existing
-- single samples at position 0 → only THEN drop the old single-sample columns.

-- AlterEnum: new document media kinds (used by call/application PDF attachments).
ALTER TYPE "MediaKind" ADD VALUE 'call_document';
ALTER TYPE "MediaKind" ADD VALUE 'application_document';

-- CreateTable: ProjectCallAsset (call samples + documents).
CREATE TABLE "ProjectCallAsset" (
    "callId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProjectCallAsset_pkey" PRIMARY KEY ("callId","mediaId")
);

-- CreateTable: ApplicationAsset (application samples — media XOR portfolio, display info denormalized).
CREATE TABLE "ApplicationAsset" (
    "applicationId" TEXT NOT NULL,
    "mediaId" TEXT,
    "portfolioItemId" TEXT,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ApplicationAsset_pkey" PRIMARY KEY ("applicationId","position")
);

-- CreateIndex
CREATE INDEX "ProjectCallAsset_callId_position_idx" ON "ProjectCallAsset"("callId", "position");
CREATE INDEX "ApplicationAsset_applicationId_idx" ON "ApplicationAsset"("applicationId");

-- AddForeignKey
ALTER TABLE "ProjectCallAsset" ADD CONSTRAINT "ProjectCallAsset_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ProjectCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill BEFORE the drops: preserve every existing single sample at position 0.
INSERT INTO "ProjectCallAsset" ("callId", "mediaId", "position")
SELECT "id", "sampleMediaId", 0 FROM "ProjectCall" WHERE "sampleMediaId" IS NOT NULL;

INSERT INTO "ApplicationAsset" ("applicationId", "mediaId", "portfolioItemId", "url", "kind", "size", "position")
SELECT "id", "sampleMediaId", "samplePortfolioItemId", "sampleUrl", 'image', NULL, 0 FROM "Application";

-- AlterTable: drop the retired single-sample columns (data preserved above).
ALTER TABLE "Application" DROP COLUMN "sampleMediaId",
DROP COLUMN "samplePortfolioItemId";

ALTER TABLE "ProjectCall" DROP COLUMN "sampleMediaId";
