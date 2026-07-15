-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('scenario', 'dessin');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('a_corriger', 'en_cours', 'corrige');

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" "CorrectionType" NOT NULL,
    "anchor" JSONB NOT NULL,
    "assetId" TEXT NOT NULL,
    "caseRef" TEXT,
    "description" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'a_corriger',
    "authorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "filedAgainstVersion" INTEGER NOT NULL,
    "resolvedInVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Correction_pageId_type_status_createdAt_idx" ON "Correction"("pageId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Correction_assetId_status_idx" ON "Correction"("assetId", "status");

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
