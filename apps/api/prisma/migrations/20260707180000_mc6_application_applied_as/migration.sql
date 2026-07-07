-- MC-6: applied-as role on Application (nullable; dual-role users pick which role they apply as)
ALTER TABLE "Application" ADD COLUMN "appliedAs" TEXT;
