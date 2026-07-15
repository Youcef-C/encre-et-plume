-- CS-5 r3 (B14): backfill ScenarioComment.version for legacy rows (version IS NULL).
-- Pre-r2 comments were never stamped, so they hide under any v{n} version filter. Stamp each null-version
-- comment with the asset version that was head at the comment's createdAt (the version it was filed
-- against), via the ScenarioDocument→AssetVersion timeline. Fallback to 1 if no version predates it.
-- Idempotent: only touches version IS NULL rows; new rows are always stamped by addComment (B8) so a
-- re-run is a no-op. Schema unchanged (version stays nullable — this is data-only).
UPDATE "ScenarioComment" c
SET "version" = COALESCE(
  (
    SELECT MAX(av."version")
    FROM "AssetVersion" av
    JOIN "ScenarioDocument" sd ON sd."assetId" = av."assetId"
    WHERE sd."id" = c."documentId"
      AND av."createdAt" <= c."createdAt"
  ),
  1
)
WHERE c."version" IS NULL;
