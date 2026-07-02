-- CreateEnum
CREATE TYPE "LegalKind" AS ENUM ('cgu', 'privacy', 'mentions');

-- CreateEnum
CREATE TYPE "ConsentDocument" AS ENUM ('cgu', 'privacy');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "kind" "LegalKind" NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "document" "ConsentDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDocument_kind_publishedAt_idx" ON "LegalDocument"("kind", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_kind_version_key" ON "LegalDocument"("kind", "version");

-- CreateIndex
CREATE INDEX "ConsentRecord_accountId_document_idx" ON "ConsentRecord"("accountId", "document");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- F-13 seed: placeholder legal copy — team replaces content, bumps version to trigger re-consent.
INSERT INTO "LegalDocument" ("id","kind","version","content","publishedAt") VALUES
  ('seed_cgu_1','cgu','1.0','<h1>Conditions générales d''utilisation</h1><p>[Contenu juridique à valider par l''équipe]</p>', now()),
  ('seed_privacy_1','privacy','1.0','<h1>Politique de confidentialité</h1><p>[Contenu juridique à valider par l''équipe]</p>', now()),
  ('seed_mentions_1','mentions','1.0','<h1>Mentions légales</h1><p>[Contenu juridique à valider par l''équipe]</p>', now())
ON CONFLICT ("kind","version") DO NOTHING;
