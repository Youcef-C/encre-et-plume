-- CS-7 R8 — a card's PLACEMENT within its chapter becomes explicit. Until now the strip and the
-- board ordered cards by `createdAt`, so an author could not say where a page sits, and a `double`
-- spread was numbered as one page. `position` is a dense 0..n-1 slot per chapter; the displayed page
-- numbers derive from it, a `double` consuming two.
--
-- The backfill preserves the order everyone currently sees (createdAt asc), so the migration is a
-- no-op visually.
ALTER TABLE "Page" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

UPDATE "Page" p
SET "position" = s.rn - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY "chapterId" ORDER BY "createdAt", id) AS rn
  FROM "Page"
) s
WHERE p.id = s.id;

CREATE INDEX "Page_chapterId_position_idx" ON "Page"("chapterId", "position");
