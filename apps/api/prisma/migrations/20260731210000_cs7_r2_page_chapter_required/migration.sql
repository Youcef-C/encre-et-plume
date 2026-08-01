-- CS-7 R2-1d — every board card belongs to a chapter (user rule, 2026-07-31).
--
-- The "Sans chapitre" bucket is gone: a nullable `chapterId` is what made that forbidden state
-- representable, so the invariant is enforced by the constraint rather than by app-level discipline
-- (create already 400s without a chapter; DELETE /chapters/:id now 409s while the chapter holds
-- cards instead of unlinking them).
--
-- No backfill: the local dev DB was reset with the user's explicit consent (2026-07-31) and no
-- environment holds data yet. Neither seed creates Page rows, so both are conforming by construction.
ALTER TABLE "Page" ALTER COLUMN "chapterId" SET NOT NULL;
