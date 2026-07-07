-- MC-1 round 2: re-base Profile.region from continents to French régions (+ "Hors France").
-- The region vocabulary now matches geo.api.gouv.fr `region.nom`; every legacy continent value
-- collapses to the "Hors France" fallback bucket (seeds then restore real régions on fixtures).

ALTER TABLE "Profile" ALTER COLUMN "region" SET DEFAULT 'Hors France';

UPDATE "Profile" SET "region" = 'Hors France'
WHERE "region" NOT IN (
  'Auvergne-Rhône-Alpes','Bourgogne-Franche-Comté','Bretagne','Centre-Val de Loire','Corse',
  'Grand Est','Guadeloupe','Guyane','Hauts-de-France','Île-de-France','La Réunion',
  'Martinique','Mayotte','Normandie','Nouvelle-Aquitaine','Occitanie','Pays de la Loire',
  'Provence-Alpes-Côte d''Azur','Hors France'
);
