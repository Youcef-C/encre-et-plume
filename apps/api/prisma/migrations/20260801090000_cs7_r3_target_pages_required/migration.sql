-- CS-7 R3-2 — the progress bar is ALWAYS displayed, so every chapter must have a planned length.
-- `targetPages` becomes NOT NULL with a default of 20 (a standard manga chapter, and between the
-- prototype's own drawn "18 planches" and "22 planches"). Existing rows are backfilled to the same
-- default; this reverses R2-7c's nullable "not planned yet" state, which no longer exists.
UPDATE "Chapter" SET "targetPages" = 20 WHERE "targetPages" IS NULL;

ALTER TABLE "Chapter" ALTER COLUMN "targetPages" SET DEFAULT 20;
ALTER TABLE "Chapter" ALTER COLUMN "targetPages" SET NOT NULL;
