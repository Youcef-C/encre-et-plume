-- CS-7 follow-up — `Project.workId` becomes NOT NULL.
-- The column was nullable "so legacy/seed Projects survive"; that allowance is what let a seed create
-- a Work-less Project, which every project read then rejected with « Projet introuvable ». Making the
-- bridge required turns that defect into an unrepresentable state instead of a guard in each service.
-- No backfill: verified 0 rows with a null "workId" before writing this, and both seeds create the
-- Work half in the same transaction as the Project.
ALTER TABLE "Project" ALTER COLUMN "workId" SET NOT NULL;
