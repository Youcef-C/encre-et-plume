-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'call_sample';

-- AlterTable
ALTER TABLE "ProjectCall" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "format" TEXT,
ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sampleMediaId" TEXT,
ADD COLUMN     "scope" TEXT;

-- CreateIndex
CREATE INDEX "ProjectCall_authorId_idx" ON "ProjectCall"("authorId");

