-- CreateEnum
CREATE TYPE "PageStage" AS ENUM ('scenario', 'nemu', 'corrections', 'propre', 'encrage', 'valide');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "collabOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "stage" "PageStage" NOT NULL DEFAULT 'scenario',
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedFileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Page_projectId_chapterId_stage_idx" ON "Page"("projectId", "chapterId", "stage");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_version_idx" ON "PageVersion"("pageId", "version");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
