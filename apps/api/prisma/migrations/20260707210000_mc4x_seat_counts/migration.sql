-- MC-4X §8: derive author position from profile + per-role seat counts.
-- Hand-edited: add authorRoles[]/seats → BACKFILL from the old authorRole + seekingRoles → drop authorRole.

-- AlterTable: new columns.
ALTER TABLE "ProjectCall"
  ADD COLUMN "authorRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "seats" JSONB NOT NULL DEFAULT '{}';

-- Backfill BEFORE the drop: the single authorRole becomes a 1-element array;
-- each existing sought role becomes 1 seat, e.g. {dessinateur} → {"dessinateur": 1}.
UPDATE "ProjectCall" SET "authorRoles" = ARRAY["authorRole"] WHERE "authorRole" IS NOT NULL;
UPDATE "ProjectCall"
  SET "seats" = COALESCE((SELECT jsonb_object_agg(r, 1) FROM unnest("seekingRoles") AS r), '{}'::jsonb);

-- AlterTable: drop the retired single-role column (data preserved above).
ALTER TABLE "ProjectCall" DROP COLUMN "authorRole";
