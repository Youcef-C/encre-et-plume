-- MC-1 (owner addendum §5): location unit becomes country (ISO 3166-1 alpha-2); the 18 French régions
-- stay as the FR-only optional sub-level; the 'Hors France' bucket is retired.
--
-- NOTE: Profile.city is deliberately KEPT — it is load-bearing for gallery / works / search / the
-- profile identity line (F-3), all outside MC-1. The partner directory simply ignores it (card
-- location is composed from country + région). See backend-notes.md "Round 2 addendum".

-- Add the country column (nullable) and relax region to nullable + no default.
ALTER TABLE "Profile" ADD COLUMN "country" TEXT;
ALTER TABLE "Profile" ALTER COLUMN "region" DROP NOT NULL;
ALTER TABLE "Profile" ALTER COLUMN "region" DROP DEFAULT;

CREATE INDEX "Profile_country_idx" ON "Profile"("country");

-- Re-base existing data: rows carrying a real French région belong to France.
UPDATE "Profile" SET "country" = 'FR'
WHERE "region" IN (
  'Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Bretagne','Centre-Val de Loire','Corse',
  'Grand Est','Guadeloupe','Guyane','Hauts-de-France','Île-de-France','La Réunion',
  'Martinique','Mayotte','Normandie','Nouvelle-Aquitaine','Occitanie','Pays de la Loire',
  'Provence-Alpes-Côte d''Azur'
);

-- Everything else (the retired 'Hors France' bucket and any legacy value) loses its région; its
-- country stays NULL until the profile owner sets one (seeds restore real countries on fixtures).
UPDATE "Profile" SET "region" = NULL
WHERE "region" IS NOT NULL AND "region" NOT IN (
  'Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Bretagne','Centre-Val de Loire','Corse',
  'Grand Est','Guadeloupe','Guyane','Hauts-de-France','Île-de-France','La Réunion',
  'Martinique','Mayotte','Normandie','Nouvelle-Aquitaine','Occitanie','Pays de la Loire',
  'Provence-Alpes-Côte d''Azur'
);
