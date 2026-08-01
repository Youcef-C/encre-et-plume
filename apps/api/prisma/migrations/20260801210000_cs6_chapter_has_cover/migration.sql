-- CS-6 — « Couverture » toggle. The cover is always the chapter's FIRST page, so there is nothing to
-- designate; this only records whether that page IS a cover. Default true: the prototype's
-- ARRANGEMENT grid draws the « COUV. » badge on P.1, so existing chapters keep what is on screen.
--
-- The reader consequence lives with the flag: a cover is a standalone recto and must never be paired
-- into a 2-page spread.
ALTER TABLE "Chapter" ADD COLUMN "hasCover" BOOLEAN NOT NULL DEFAULT true;
