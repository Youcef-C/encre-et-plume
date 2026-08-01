-- CS-7 · chapter management
--
-- 1. `resume` — the one new column (progressPct / plancheCount stay DERIVED per request).
-- 2. `(workId, number)` becomes UNIQUE (B5: chapter numbers are unique per project; Project.workId
--    is 1:1 so work-scoped == project-scoped).
--
-- Seeded/legacy data may already hold colliding (workId, number) rows, which would make the unique
-- index fail to build. Renumber the duplicates FIRST: the oldest row of each colliding group keeps
-- its number, the rest are pushed above the work's current max.

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN "resume" TEXT;

-- Deduplicate before constraining.
WITH ranked AS (
  SELECT "id",
         "workId",
         ROW_NUMBER() OVER (PARTITION BY "workId", "number" ORDER BY "createdAt", "id") AS rn
  FROM "Chapter"
),
maxes AS (
  SELECT "workId", MAX("number") AS max_number FROM "Chapter" GROUP BY "workId"
),
offsets AS (
  SELECT r."id",
         m.max_number + ROW_NUMBER() OVER (PARTITION BY r."workId" ORDER BY r."id") AS new_number
  FROM ranked r
  JOIN maxes m ON m."workId" = r."workId"
  WHERE r.rn > 1
)
UPDATE "Chapter" c
SET "number" = o.new_number
FROM offsets o
WHERE c."id" = o."id";

-- DropIndex (superseded by the unique index below — same leading columns).
DROP INDEX IF EXISTS "Chapter_workId_number_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_workId_number_key" ON "Chapter"("workId", "number");
