-- Seed-coherence pass (2026-08-02): drop the denormalized `Work.meta` line.
--
-- It was a stored String duplicating the creators AND the chapter count, with no writer keeping it
-- in sync: 7 of 9 seeded works named someone who was not a WorkCreator, and its chapter count
-- disagreed with `Work.chapterCount` on 6 of 9. The line is now DERIVED at read time from the
-- WorkCreator relation + chapterCount by the shared `workMetaLine()` formatter.
--
-- The one capability that rode on this column — catalog search by author name
-- (`WHERE meta ILIKE '%q%'`) — moves to a relation match on WorkCreator -> Account.displayName,
-- which is what the supporting index below serves.
ALTER TABLE "Work" DROP COLUMN "meta";

-- Search-by-author-name and the WorkCreator include on every list read both traverse
-- WorkCreator(workId) -> Account(displayName). The FK index already exists; this one makes the
-- name predicate itself indexable for case-insensitive prefix/contains scans.
CREATE INDEX IF NOT EXISTS "Account_displayName_idx" ON "Account" ("displayName");
