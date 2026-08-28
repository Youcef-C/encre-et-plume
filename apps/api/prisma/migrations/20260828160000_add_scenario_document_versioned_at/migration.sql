-- Follow-up 7 (CS-20 D-10): replace the 5s grace window with a real column.
-- Nullable and NOT back-filled: existing documents keep the legacy timestamp comparison.
ALTER TABLE "ScenarioDocument" ADD COLUMN "versionedAt" TIMESTAMP(3);
