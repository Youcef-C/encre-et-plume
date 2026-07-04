-- AlterTable
ALTER TABLE "Illustration" ADD COLUMN     "description" TEXT,
ADD COLUMN     "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "license" TEXT,
ADD COLUMN     "tools" TEXT;
