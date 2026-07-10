-- CS-1: Project↔Work bridge + illustration contest/soutien columns.

-- AlterTable
ALTER TABLE "Illustration" ADD COLUMN     "contestId" TEXT,
ADD COLUMN     "soutien" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'prive',
ADD COLUMN     "workId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_workId_key" ON "Project"("workId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;
