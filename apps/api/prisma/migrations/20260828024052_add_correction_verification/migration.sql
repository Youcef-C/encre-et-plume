-- AlterTable
ALTER TABLE "Correction" ADD COLUMN     "resolvedById" UUID,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Correction_resolvedById_idx" ON "Correction"("resolvedById");

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
