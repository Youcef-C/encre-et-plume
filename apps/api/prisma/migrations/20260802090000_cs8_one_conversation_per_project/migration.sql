-- CS-8 — one discussion thread per project.
--
-- MC-9 already reserved `Conversation.projectId` as the CS-8 seam; CS-8 provisions the row on first
-- access to the Discussion tab. Two members opening that tab at the same instant would otherwise
-- create two threads and split the team's history, so the rule becomes a DB constraint instead of an
-- application check (the service adopts the winner's row on a P2002).
--
-- Pre-flight: refuse to run if any project already carries two conversations, rather than failing
-- halfway through the index build with a raw Postgres error. Nothing creates project-linked
-- conversations before this migration, so this can only fire on a hand-edited database.
DO $$
DECLARE dupes integer;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT "projectId" FROM "Conversation"
    WHERE "projectId" IS NOT NULL
    GROUP BY "projectId" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'CS-8: % project(s) already have more than one conversation — merge them first', dupes;
  END IF;
END $$;

-- NULL is not equal to NULL in Postgres, so DM/salon rows (projectId IS NULL) repeat freely.
DROP INDEX IF EXISTS "Conversation_projectId_idx";
CREATE UNIQUE INDEX "Conversation_projectId_key" ON "Conversation"("projectId");
