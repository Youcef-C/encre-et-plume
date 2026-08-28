-- CS-22 — durable comment anchors: persist the Yjs relative positions next to the (kept) absolute pair.
-- Additive only; existing rows keep NULL and fall back to anchorFrom/anchorTo on the client.
ALTER TABLE "ScenarioComment" ADD COLUMN "anchorRelFrom" BYTEA,
                              ADD COLUMN "anchorRelTo" BYTEA;
