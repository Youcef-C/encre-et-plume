-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('dessin', 'texte', 'scenario', 'ref', 'page');

-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'asset';

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "filename" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "size" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "linkedPageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "note" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_projectId_type_idx" ON "Asset"("projectId", "type");

-- CreateIndex
CREATE INDEX "Asset_projectId_updatedAt_idx" ON "Asset"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "Asset_linkedPageId_idx" ON "Asset"("linkedPageId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_projectId_filename_key" ON "Asset"("projectId", "filename");

-- CreateIndex
CREATE UNIQUE INDEX "AssetVersion_assetId_version_key" ON "AssetVersion"("assetId", "version");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_linkedPageId_fkey" FOREIGN KEY ("linkedPageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
