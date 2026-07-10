-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nextReleaseAt" TIMESTAMP(3),
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "step" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
