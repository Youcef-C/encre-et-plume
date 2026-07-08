-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_callId_fkey";

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_callId_fkey" FOREIGN KEY ("callId") REFERENCES "ProjectCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
