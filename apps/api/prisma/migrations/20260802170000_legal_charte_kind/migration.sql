-- The Charte de la communauté is declared an integral part of the CGU (CGU art. 2 & 3), so it has to
-- be reachable. It gets its own LegalKind; its content is loaded from `legal/charte-communaute.md`
-- by `prisma/seed.js` (via `prisma/legal-content.js`), like the three other documents.
ALTER TYPE "LegalKind" ADD VALUE IF NOT EXISTS 'charte';
