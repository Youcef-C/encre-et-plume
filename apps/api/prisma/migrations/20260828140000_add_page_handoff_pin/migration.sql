-- CS-20 — scenario handoff pin: which scenario asset+version the card was handed off against.
-- Both columns nullable and NOT back-filled: a pre-CS-20 card has no pin, and guessing one would
-- claim an artist drew against a version they never saw.
ALTER TABLE "Page" ADD COLUMN "drawnAgainstAssetId" UUID,
                   ADD COLUMN "drawnAgainstVersion" INTEGER;

-- SET NULL: deleting the pinned asset drops the pin instead of failing the delete.
ALTER TABLE "Page" ADD CONSTRAINT "Page_drawnAgainstAssetId_fkey"
  FOREIGN KEY ("drawnAgainstAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every FK carries its own index (the SET NULL above scans Page on an Asset delete).
CREATE INDEX "Page_drawnAgainstAssetId_idx" ON "Page"("drawnAgainstAssetId");
