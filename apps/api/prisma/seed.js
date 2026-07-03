'use strict';
/**
 * DR-1/DR-2 dev/e2e seed — home showroom + catalog "Découvrir" data (Work/Chapter/Announcement,
 * Contest/EditorPick + two top-creator profiles). Idempotent: upserts on unique keys (slug / email);
 * safe to run repeatedly.
 * Usage: node prisma/seed.js — wired as `prisma.seed` in package.json → `pnpm exec prisma db seed`.
 *
 * ponytail: plain JS (mirrors e2e-seed.js/e2e-add-portfolio.js), no ts-node — no new runtime dependency.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY_MS);

// weeklyLikeDelta/priorWeekLikeDelta chosen so round((weekly-prior)/prior*100) matches the
// prototype's growth arrows (↑24%/↑18%/↑12%/↑9%, lines 429-441).
// DR-2 adds: themes/format/language/audienceRating/complete/chapterCount/ratingAvg/publishedAt.
// publishedAt is spread over the past ~4 months (relative `inDays(-n)`) so "nouveautes" sort is
// meaningful and stays correct whenever the seed is re-run.
const WORKS = [
  { slug: 'neon-sutra', title: 'Néon Sutra', genre: 'Shōnen', meta: 'Léa B. × Hugo D. · 24 ch.', likeCount: 8100, weeklyLikeDelta: 620, priorWeekLikeDelta: 500, featuredRank: 0, themes: ['Action', 'Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 20, ratingAvg: 4.5, publishedAt: inDays(-120) },
  // round-2: audienceRating '18+' — gives the PUBLIC "+18" facet a fixture (genre/themes stay
  // non-mature, so "Mature" and "+18" are independently demonstrable, per plan R2-3).
  { slug: 'le-dernier-ronin', title: 'Le Dernier Ronin', genre: 'Seinen', meta: 'Marc T. · 31 ch.', likeCount: 5700, weeklyLikeDelta: 590, priorWeekLikeDelta: 500, featuredRank: null, themes: ['Action', 'Thriller'], format: 'Manga', language: 'Français', audienceRating: '18+', complete: false, chapterCount: 15, ratingAvg: 4.2, publishedAt: inDays(-90) },
  { slug: 'spectres-davril', title: "Spectres d'Avril", genre: 'Fantastique', meta: 'Nadia F. × Sami R. · 15 ch.', likeCount: 4000, weeklyLikeDelta: 560, priorWeekLikeDelta: 500, featuredRank: null, themes: ['Horreur', 'Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 10, ratingAvg: 3.9, publishedAt: inDays(-40) },
  { slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', meta: 'Camille R. × Yuki M. · 20 ch.', likeCount: 3400, weeklyLikeDelta: 545, priorWeekLikeDelta: 500, featuredRank: 1, themes: ['Action'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: true, chapterCount: 12, ratingAvg: 4.7, publishedAt: inDays(-60) },
  // round-2: themes includes 'Gore' (genres.json id 'gore', mature:true) — gives the PUBLIC
  // "Mature" facet a fixture via genre-OR-themes matching (Onibi's genre 'Fantastique' isn't mature).
  { slug: 'onibi', title: 'Onibi', genre: 'Fantastique', meta: 'Sana K. · 7 ch.', likeCount: 2600, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Horreur', 'Gore'], format: 'One-shot', language: 'Français', audienceRating: '16+', complete: false, chapterCount: 14, ratingAvg: 4.0, publishedAt: inDays(-10) },
  { slug: 'vertige', title: 'Vertige', genre: 'Shōnen', meta: 'Théo L. · 12 ch.', likeCount: 2200, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 12, ratingAvg: 3.6, publishedAt: inDays(-5) },
  // round-2: language 'English' (was 'Traduit', removed from the vocabulary) — gives the LANGUE
  // "English" facet a fixture.
  { slug: 'encre-blanche', title: 'Encre Blanche', genre: 'Josei', meta: 'Inès P. · 9 ch.', likeCount: 1800, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Romance'], format: 'Manga', language: 'English', audienceRating: 'Tous publics', complete: false, chapterCount: 8, ratingAvg: 4.3, publishedAt: inDays(-20) },
  // DR-2: new Roman card (prototype "FORMAT" facet — Manga/One-shot/Roman).
  { slug: 'dr2-le-murmure-des-cendres', title: 'Le Murmure des Cendres', genre: 'Fantastique', meta: 'Inès P. · 8 ch.', likeCount: 1200, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Aventure'], format: 'Roman', language: 'Français', audienceRating: 'Tous publics', complete: true, chapterCount: 8, ratingAvg: 4.8, publishedAt: inDays(-2) },
];

// DR-2: "Actualités" concours card + "SÉLECTION ÉDITEUR" pick (namespaced dr2-* per DR-1's
// slug-collision note — QA fixtures from other stories reuse bare slugs).
const CONTESTS = [
  { id: 'dr2-contest-1', category: 'CONCOURS', title: 'Prix du jeune mangaka 2026', subtitle: 'Doté par un éditeur · clôture 30 j', ctaLabel: 'Participer', href: '/concours', active: true },
];
const EDITOR_PICKS = [
  { workSlug: 'encre-blanche', blurb: '« Encre Blanche » repéré par une maison partenaire', order: 0 },
];

// "Sorties programmées" — countdowns match the prototype (dans 1/4/7/16 j, lines 460-463) as
// relative offsets from "now" so the seed stays correct whenever it's run.
const SCHEDULED_CHAPTERS = [
  { workSlug: 'lames-de-brume', number: 2, publishAt: inDays(1) },
  { workSlug: 'onibi', number: 7, publishAt: inDays(4) },
  { workSlug: 'vertige', number: 3, publishAt: inDays(7) },
  { workSlug: 'encre-blanche', number: 9, publishAt: inDays(16) },
];

// Labels verbatim from prototype lines 413/415/417 (type tag rendered separately by the FE
// via ANNOUNCEMENT_LABEL — see packages/shared/src/home.ts + apps/web/lib/home.ts).
const ANNOUNCEMENTS = [
  { type: 'concours', label: '« Prix du jeune mangaka 2026 » — clôture dans 30 j', href: '/concours', order: 0 },
  { type: 'a_chaud', label: "« Néon Sutra » dépasse les 8k j'aime", href: '/actualites', order: 1 },
  { type: 'evenement', label: '« Lames de Brume » Ch.2 vendredi', href: '/actualites', order: 2 },
];

// Top artiste/scénariste du moment — also the (fictional) creative duo behind "Lames de Brume".
const CREATORS = [
  { email: 'yuki.moreau@seed.encre-et-plume.local', displayName: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'dessinateur' },
  { email: 'camille.roux@seed.encre-et-plume.local', displayName: 'Camille Roux', slug: 'dr1-camille-roux', role: 'scenariste' },
];

async function main() {
  const hash = bcrypt.hashSync('password123', 10);

  for (const w of WORKS) {
    const work = await prisma.work.upsert({ where: { slug: w.slug }, create: w, update: w });

    const chapter = SCHEDULED_CHAPTERS.find((c) => c.workSlug === w.slug);
    if (chapter) {
      // Clear + recreate so reseeding doesn't accumulate duplicate scheduled chapters.
      await prisma.chapter.deleteMany({ where: { workId: work.id, status: 'scheduled' } });
      await prisma.chapter.create({
        data: { workId: work.id, number: chapter.number, status: 'scheduled', publishAt: chapter.publishAt },
      });
    }
  }

  await prisma.announcement.deleteMany({});
  for (const a of ANNOUNCEMENTS) {
    await prisma.announcement.create({ data: a });
  }

  for (const c of CONTESTS) {
    await prisma.contest.upsert({ where: { id: c.id }, create: c, update: c });
  }

  for (const p of EDITOR_PICKS) {
    const work = await prisma.work.findUnique({ where: { slug: p.workSlug } });
    if (!work) continue;
    // Clear + recreate so reseeding doesn't accumulate duplicate picks for the same work.
    await prisma.editorPick.deleteMany({ where: { workId: work.id } });
    await prisma.editorPick.create({ data: { workId: work.id, blurb: p.blurb, order: p.order } });
  }

  for (const c of CREATORS) {
    const account = await prisma.account.upsert({
      where: { email: c.email },
      create: { email: c.email, displayName: c.displayName, passwordHash: hash, profileSlug: c.slug, role: 'utilisateur' },
      update: { displayName: c.displayName, profileSlug: c.slug },
    });
    await prisma.profile.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, creatorRoles: [c.role], trendingScore: 100 },
      update: { creatorRoles: [c.role], trendingScore: 100 },
    });
  }
}

main()
  .catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
