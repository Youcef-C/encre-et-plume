-- Drift fix (found while running the CS-6 e2e suite; the defect belongs to CS-7 R2-1d).
--
-- `20260731210000_cs7_r2_page_chapter_required` made `Page.chapterId` NOT NULL but left the foreign
-- key's `ON DELETE SET NULL` action from when the column was still nullable. The two now contradict
-- each other: deleting a chapter that still holds cards tries to null a NOT NULL column and raises a
-- raw null-constraint error (an unmapped 500) instead of restricting.
--
-- Prisma's schema already declares the intended behaviour — `chapter Chapter @relation(...)` is a
-- REQUIRED relation with no `onDelete`, i.e. `Restrict` — so this only makes the database match the
-- schema (`prisma migrate dev` would generate the same change). The service's 409 "ce chapitre
-- contient N cartes" stays the user-facing rule; this is the backstop behind it.
ALTER TABLE "Page" DROP CONSTRAINT "Page_chapterId_fkey";

ALTER TABLE "Page" ADD CONSTRAINT "Page_chapterId_fkey"
  FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
