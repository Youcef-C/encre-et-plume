-- F-17: onboarding first-run. Adds Account.onboardedAt and Profile.creatorRoles.
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "creatorRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
