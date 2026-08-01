-- CS-7 R2-7 — « PLANCHES PRÉVUES »: the chapter's planned length.
--
-- The progress pill used to read done ÷ linked-cards, which is meaningless (link one card, finish it,
-- 100 %). It now reads done ÷ targetPages. NULL = no planned length yet, and the DTO then reports
-- `progressPct: null` so the pill shows « En cours » with no number at all.
ALTER TABLE "Chapter" ADD COLUMN "targetPages" INTEGER;
