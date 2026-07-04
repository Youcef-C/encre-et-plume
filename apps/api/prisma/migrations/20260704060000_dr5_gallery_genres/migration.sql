-- AlterTable
ALTER TABLE "Illustration" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[];

