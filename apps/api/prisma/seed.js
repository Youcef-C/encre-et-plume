'use strict';
/**
 * DR-1/DR-2/DR-3/DR-4 dev/e2e seed — home showroom + catalog "Découvrir" + work page "Œuvre" +
 * reader "Lecteur" data (Work/Chapter/Announcement, Contest/EditorPick, WorkCreator/Planche/
 * FundingGoal/Review, Favorite + two top-creator profiles). Idempotent: upserts on unique keys
 * (slug / email / [workId,accountId] / [accountId,workId]), deletes-then-recreates per-work child
 * rows (chapters/planches/goals/reviews/reader pages); safe to re-run.
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
// DR-3: synopsis + hashtags backfilled on all 8 works (so any card's /oeuvre/{slug} renders);
// readCount/favoriteCount default to 0 except the showcase manga (below), which matches the
// prototype's static "128k lectures / 340 ★ favoris" numbers verbatim.
const WORKS = [
  { slug: 'neon-sutra', title: 'Néon Sutra', genre: 'Shōnen', meta: 'Léa B. × Hugo D. · 24 ch.', likeCount: 8100, weeklyLikeDelta: 620, priorWeekLikeDelta: 500, featuredRank: 0, themes: ['Action', 'Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 20, ratingAvg: 4.5, publishedAt: inDays(-120), synopsis: 'Dans une mégapole où les prières se négocient comme des devises, un moine renégat et une hackeuse de temple s’allient pour retrouver le sutra volé qui maintient la ville en vie.', hashtags: ['shonen', 'action', 'aventure'] },
  // round-2: audienceRating '18+' — gives the PUBLIC "+18" facet a fixture (genre/themes stay
  // non-mature, so "Mature" and "+18" are independently demonstrable, per plan R2-3).
  { slug: 'le-dernier-ronin', title: 'Le Dernier Ronin', genre: 'Seinen', meta: 'Marc T. · 31 ch.', likeCount: 5700, weeklyLikeDelta: 590, priorWeekLikeDelta: 500, featuredRank: null, themes: ['Action', 'Thriller'], format: 'Manga', language: 'Français', audienceRating: '18+', complete: false, chapterCount: 15, ratingAvg: 4.2, publishedAt: inDays(-90), synopsis: 'Dernier héritier d’une école de sabre dissoute, il traverse un Japon uchronique gangrené par des clans mercenaires, une dette de sang à rembourser chapitre après chapitre.', hashtags: ['seinen', 'sabre', 'vengeance'] },
  { slug: 'spectres-davril', title: "Spectres d'Avril", genre: 'Fantastique', meta: 'Nadia F. × Sami R. · 15 ch.', likeCount: 4000, weeklyLikeDelta: 560, priorWeekLikeDelta: 500, featuredRank: null, themes: ['Horreur', 'Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 10, ratingAvg: 3.9, publishedAt: inDays(-40), synopsis: 'Chaque printemps, un village normand voit revenir les esprits de ceux qui n’ont pas eu de sépulture. Une exorciste itinérante et son apprenti tentent d’en percer le rituel avant le prochain avril.', hashtags: ['fantastique', 'horreur', 'aventure'] },
  { slug: 'lames-de-brume', title: 'Lames de Brume', genre: 'Seinen', meta: 'Camille R. × Yuki M. · 20 ch.', likeCount: 3400, weeklyLikeDelta: 545, priorWeekLikeDelta: 500, featuredRank: 1, themes: ['Action'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: true, chapterCount: 12, ratingAvg: 4.7, publishedAt: inDays(-60), synopsis: 'Deux âmes liées par la brume et le sabre, dans un Japon parallèle où chaque faute du passé prend la forme d’un spectre à abattre.', hashtags: ['seinen', 'duo', 'drame'], readCount: 128000, favoriteCount: 340 },
  // round-2: themes includes 'Gore' (genres.json id 'gore', mature:true) — gives the PUBLIC
  // "Mature" facet a fixture via genre-OR-themes matching (Onibi's genre 'Fantastique' isn't mature).
  { slug: 'onibi', title: 'Onibi', genre: 'Fantastique', meta: 'Sana K. · 7 ch.', likeCount: 2600, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Horreur', 'Gore'], format: 'One-shot', language: 'Français', audienceRating: '16+', complete: false, chapterCount: 14, ratingAvg: 4.0, publishedAt: inDays(-10), synopsis: 'Un feu-follet hante les ruines d’un sanctuaire abandonné ; la seule survivante de l’incendie qui l’a créé revient l’affronter, une nuit, pour de bon.', hashtags: ['horreur', 'gore', 'oneshot'] },
  { slug: 'vertige', title: 'Vertige', genre: 'Shōnen', meta: 'Théo L. · 12 ch.', likeCount: 2200, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Aventure'], format: 'Manga', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 12, ratingAvg: 3.6, publishedAt: inDays(-5), synopsis: 'Un jeune grimpeur découvre qu’une cité entière est bâtie à la verticale d’une falaise sans fond — et que personne n’en est jamais redescendu vivant.', hashtags: ['shonen', 'aventure'] },
  // round-2: language 'English' (was 'Traduit', removed from the vocabulary) — gives the LANGUE
  // "English" facet a fixture.
  { slug: 'encre-blanche', title: 'Encre Blanche', genre: 'Josei', meta: 'Inès P. · 9 ch.', likeCount: 1800, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Romance'], format: 'Manga', language: 'English', audienceRating: 'Tous publics', complete: false, chapterCount: 8, ratingAvg: 4.3, publishedAt: inDays(-20), synopsis: 'Une restauratrice de livres anciens et un calligraphe itinérant échangent des lettres qu’aucun des deux n’ose signer de son vrai nom.', hashtags: ['josei', 'romance'] },
  // DR-2: new Roman card (prototype "FORMAT" facet — Manga/One-shot/Roman). DR-3: gets proseExcerpt
  // (the prototype's "Extrait · Chapitre 1" paragraph, verbatim) to exercise the roman-only branch.
  { slug: 'dr2-le-murmure-des-cendres', title: 'Le Murmure des Cendres', genre: 'Fantastique', meta: 'Inès P. · 8 ch.', likeCount: 1200, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Aventure'], format: 'Roman', language: 'Français', audienceRating: 'Tous publics', complete: true, chapterCount: 8, ratingAvg: 4.8, publishedAt: inDays(-2), synopsis: 'Dans les cendres d’une bibliothèque incendiée, une archiviste entend les voix de ceux qui y sont morts — et l’une d’elles réclame vengeance.', hashtags: ['roman', 'fantastique'], proseExcerpt: "La pluie n'avait pas cessé depuis trois jours. Elwen poussa la porte de l'archive, et l'odeur du papier humide la prit à la gorge — une odeur qu'elle connaissait par cœur, et qui pourtant, ce matin-là, lui sembla mentir. « Vous cherchez un souvenir précis ? » murmura le gardien, sans lever les yeux…" },
];

// DR-3: creative team for the showcase manga (Lames de Brume) — the same two top-creator profiles
// DR-1 seeds (Camille Roux/Yuki Moreau), both set to Lyon to match the prototype's "· Lyon" city line.
const WORK_CREATORS = [
  { workSlug: 'lames-de-brume', accountSlug: 'dr1-camille-roux', role: 'scenariste', order: 0 },
  { workSlug: 'lames-de-brume', accountSlug: 'dr1-yuki-moreau', role: 'dessinateur', order: 1 },
];

// DR-4: roman showcase prose, verbatim from the prototype (lines 802-814), split into paragraphs.
const ROMAN_CHAPTER_1_PARAGRAPHS = [
  "La pluie n'avait pas cessé depuis trois jours. Elwen poussa la porte de l'archive, et l'odeur du papier humide la prit à la gorge — une odeur qu'elle connaissait par cœur, et qui pourtant, ce matin-là, lui sembla mentir.",
  "Les rayonnages montaient si haut qu'ils se perdaient dans la pénombre, et entre eux couraient des échelles de laiton patinées par des générations de mains anxieuses. On venait ici quand on n'avait plus rien d'autre à vendre que sa propre mémoire.",
  '« Vous cherchez un souvenir précis ? » murmura le gardien, sans lever les yeux des registres. Sa voix avait la texture du cuir usé, et ses doigts, tachés d\'encre noire, tournaient les pages avec une lenteur délibérée.',
  "Elwen hésita. Le souvenir qu'elle venait vendre n'était pas le sien — et c'était précisément pour cela qu'elle avait choisi cette archive, la plus discrète de la basse-ville, celle où l'on ne posait jamais de questions.",
  "Elle déposa sur le comptoir une fiole de verre dépoli, à l'intérieur de laquelle une brume pâle tournait paresseusement, comme une chose vivante qui aurait préféré dormir.",
  '« Ce n\'est pas un souvenir ordinaire », dit-il enfin. « Il a été manipulé. Recousu. Quelqu\'un y a ajouté quelque chose qui n\'y était pas. »',
  "Un frisson glacé descendit le long de l'échine d'Elwen. Elle avait passé des semaines à préparer cette transaction, à effacer ses traces, à répéter chaque geste. Et voilà qu'un vieil homme aux doigts noircis lisait dans le verre ce qu'elle croyait avoir si bien caché.",
  '« Combien ? » demanda-t-elle, d\'une voix qu\'elle voulut ferme. Le gardien reposa la fiole, croisa enfin son regard, et sourit — un sourire qui ne contenait aucune chaleur.',
  '« Je ne l\'achèterai pas », répondit-il. « Mais je vous propose un marché bien plus intéressant. Dites-moi de qui est ce souvenir, et je vous dirai pourquoi on a essayé de l\'effacer de votre propre tête. »',
  "Elle ignorait encore que, ce jour-là, c'était sa propre mémoire qui allait lui être volée.",
];

// DR-3: ~12 published chapters for the showcase manga — first 3 verbatim from the prototype
// (title/plancheCount/date/likeCount), the rest generic continuations (all in the past -> published).
// DR-4: chapters 4-12 are `premium:true` (verrouillé ★ + paywall + 403 path); chapters 1-3 stay
// free, matching the prototype.
const WORK_CHAPTERS = {
  'lames-de-brume': [
    { number: 1, title: 'Sous la pluie', plancheCount: 22, publishAt: new Date('2024-03-14'), likeCount: 1800, premium: false },
    { number: 2, title: 'La rencontre', plancheCount: 18, publishAt: new Date('2024-06-21'), likeCount: 1200, premium: false },
    { number: 3, title: 'Le pacte', plancheCount: 20, publishAt: new Date('2024-09-12'), likeCount: 980, premium: false },
    { number: 4, title: null, plancheCount: 19, publishAt: new Date('2024-11-01'), likeCount: 820, premium: true },
    { number: 5, title: null, plancheCount: 21, publishAt: new Date('2025-01-15'), likeCount: 760, premium: true },
    { number: 6, title: null, plancheCount: 18, publishAt: new Date('2025-03-01'), likeCount: 700, premium: true },
    { number: 7, title: null, plancheCount: 20, publishAt: new Date('2025-05-01'), likeCount: 650, premium: true },
    { number: 8, title: null, plancheCount: 22, publishAt: new Date('2025-07-01'), likeCount: 600, premium: true },
    { number: 9, title: null, plancheCount: 19, publishAt: new Date('2025-09-01'), likeCount: 550, premium: true },
    { number: 10, title: null, plancheCount: 20, publishAt: new Date('2025-11-01'), likeCount: 500, premium: true },
    { number: 11, title: null, plancheCount: 21, publishAt: new Date('2026-01-01'), likeCount: 450, premium: true },
    { number: 12, title: null, plancheCount: 20, publishAt: new Date('2026-03-01'), likeCount: 400, premium: true },
  ],
  // DR-4: roman showcase — 1 non-premium chapter with real prose (prototype's "L'odeur du
  // papier" paragraphs verbatim, lines 802-814) so readMode:'prose' renders real content and the
  // slider paginates (10 paragraphs / PROSE_PARAGRAPHS_PER_PAGE=5 -> totalPages 2).
  'dr2-le-murmure-des-cendres': [
    {
      number: 1,
      title: "L'odeur du papier",
      plancheCount: 0,
      publishAt: new Date('2026-06-20'),
      likeCount: 340,
      premium: false,
      prose: ROMAN_CHAPTER_1_PARAGRAPHS.join('\n\n'),
    },
  ],
};

// DR-3: 6 planche/illustration grid items for the showcase manga (workId only, chapterId=null —
// these are the "Illustrations & planches" work-page grid, distinct from DR-4's reader pages below).
const WORK_PLANCHES = {
  'lames-de-brume': [0, 1, 2, 3, 4, 5].map((i) => ({ caption: `Planche ${i + 1}`, order: i })),
};

// DR-4: reader pages (Planche rows with chapterId set) for the showcase manga's 3 free chapters —
// 6 pages each, image:null (FE halftone placeholder); one page per chapter carries a caption to
// exercise the speech-bubble overlay. `double` spread metadata is a response-default (false) per
// the plan, not a seeded column.
const CHAPTER_PAGES = {
  'lames-de-brume': {
    1: [0, 1, 2, 3, 4, 5].map((i) => ({ order: i, caption: i === 2 ? '« Alors prouve-le. »' : null })),
    2: [0, 1, 2, 3, 4, 5].map((i) => ({ order: i, caption: null })),
    3: [0, 1, 2, 3, 4, 5].map((i) => ({ order: i, caption: null })),
  },
};

// DR-4: favorites seed for the "★ MES FAVORIS" quick-switch. Reuses the DR-1 creator account
// `dr1-camille-roux` (email camille.roux@seed.encre-et-plume.local, password `password123`) — the
// only real, loginable dev-seed account — rather than inventing a new one.
const FAVORITES = [
  { accountSlug: 'dr1-camille-roux', workSlug: 'lames-de-brume' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'neon-sutra' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'onibi' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'dr2-le-murmure-des-cendres' },
];

// DR-11: reading-history/resume fixtures. Same demo account as FAVORITES (dr1-camille-roux, the
// only real loginable dev-seed account — see DR-4's backend-notes flag). One manga row (chapter 1
// of the free showcase manga, page 3/6) so QA can see "Reprendre la lecture" -> chapitre=1&page=3
// on the work page, and one roman row (chapter 1, page 1/2) for the prose fixture.
const READING_PROGRESS = [
  { accountSlug: 'dr1-camille-roux', workSlug: 'lames-de-brume', chapterNumber: 1, page: 3 },
  { accountSlug: 'dr1-camille-roux', workSlug: 'dr2-le-murmure-des-cendres', chapterNumber: 1, page: 1 },
];

// DR-3: 2 funding goals for the showcase manga (percentages exercise the progress bars).
const WORK_FUNDING_GOALS = {
  'lames-de-brume': [
    { title: 'Impression papier', currentCents: 45000, targetCents: 60000, order: 0 },
    { title: 'Traduction anglaise', currentCents: 12000, targetCents: 40000, order: 1 },
  ],
};

// DR-3: reviews for the showcase manga (Histoire/Dessin sub-scores + aggregate + list).
const WORK_REVIEWS = {
  'lames-de-brume': [
    { authorName: 'Léa B.', storyRating: 5, artRating: 4, text: 'Une plume incroyable, hâte de lire la suite.' },
    { authorName: 'Hugo D.', storyRating: 4, artRating: 5, text: 'Le dessin est somptueux, chaque planche est un tableau.' },
  ],
};

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

// DR-5: gallery "Galerie" — 14 illustrations = the prototype's 2 feature/trending cards + 12 grid
// cards, verbatim titles/artists (plan §6). Categories are the canonical GALLERY_CATEGORY_KEYS
// (personnages/couvertures/decors/fanart/process) — plan §BE-2's chip-authoritative reconciliation,
// not the prototype's decorative per-card `data-illus-cat` labels. weeklyLikeDelta is set so the
// two feature-card items (Pluie de Néons, Onibi) hold the top-2 deltas -> getTrending() picks them.
// artistAccountSlug links to an existing seeded Account by profileSlug when one exists (only Yuki
// Moreau, the DR-1 creator fixture); every other artist is artistName-only (artistId: null),
// mirroring Review.authorId's nullable-author precedent — these are fictional gallery artists with
// no real Account row. publishedAt spread over the past ~70 days (relative inDays(-n)) so
// tri=nouveautes stays meaningful whenever the seed is re-run.
// Round 2: `genres` (fr labels, F-20 vocabulary — same convention as Work.genre/themes) tags each
// illustration for the genre[] facet. Cover art reuses its source work's genre (Pluie de
// Néons/Couverture · Néon Sutra -> Néon Sutra's Shōnen; Fan-art · Le Dernier Ronin -> its Seinen;
// Spectre d'avril -> Spectres d'Avril's Fantastique); the yokai-themed pieces get Yōkai/Fantastique;
// process/study sketches (Étude d'encre #7, Carnet d'encre · planche 12) carry no genre (empty array
// — a technique study isn't "about" a genre) to also demonstrate the empty-genres case.
// DR-6: description/hashtags/tools/license/width/height "stored at publish time" (illustration
// detail meta-block + "Détails" sidebar). Rich, prototype-verbatim values for the 4 Yuki Moreau
// pieces (the only real-Account artist -> "Plus de cet·te artiste" needs siblings); plausible
// per-piece values for the rest; dr5-illus-6 intentionally carries tools/license/width/height:null
// to exercise the null-fallback rendering (a rough process sketch with no recorded metadata yet).
const ILLUSTRATIONS = [
  { id: 'dr5-illus-1', title: 'Pluie de Néons', artistName: 'Yuki Moreau', artistAccountSlug: 'dr1-yuki-moreau', category: 'couvertures', genres: ['Shōnen', 'Aventure'], likeCount: 12400, weeklyLikeDelta: 900, publishAt: inDays(-8),
    description: "Encrage traditionnel rehaussé de trames numériques. Réalisée pour explorer l'ambiance pluvieuse et les reflets néon de la série — pinceau G, trames 60 lpi et quelques heures de patience.",
    hashtags: ['encre', 'noir', 'néon', 'pluie'], width: 2480, height: 3508, tools: 'Encre · CSP', license: '© Tous droits réservés' },
  { id: 'dr5-illus-2', title: 'Onibi · Esprit du feu', artistName: 'Inès Khelifi', category: 'personnages', genres: ['Yōkai', 'Fantastique'], likeCount: 9700, weeklyLikeDelta: 700, publishAt: inDays(-15),
    description: "Étude de personnage pour un esprit du feu inspiré du folklore japonais — la palette chaude tranche volontairement avec le reste de la série.",
    hashtags: ['yokai', 'feu', 'personnage'], width: 2000, height: 2800, tools: 'Procreate', license: '© Tous droits réservés' },
  { id: 'dr5-illus-3', title: 'Lames de Brume — Ch.2', artistName: 'Yuki Moreau', artistAccountSlug: 'dr1-yuki-moreau', category: 'process', genres: ['Seinen'], likeCount: 3400, weeklyLikeDelta: 320, publishAt: inDays(-30),
    description: 'Planche de production du chapitre 2 — crayonné et encrage côte à côte pour montrer le processus complet.',
    hashtags: ['process', 'encrage', 'lamesdebrume'], width: 2100, height: 2970, tools: 'Encre · CSP', license: '© Tous droits réservés' },
  { id: 'dr5-illus-4', title: 'Sanctuaire oublié', artistName: 'Hugo Da Silva', category: 'decors', genres: ['Fantastique', 'Horreur'], likeCount: 2100, weeklyLikeDelta: 180, publishAt: inDays(-45),
    description: 'Décor de sanctuaire abandonné, envahi par la végétation — étude de lumière et de perspective.',
    hashtags: ['decor', 'sanctuaire', 'ambiance'], width: 3000, height: 2000, tools: 'Photoshop', license: '© Tous droits réservés' },
  { id: 'dr5-illus-5', title: 'Rin, sous la pluie', artistName: 'Mira K.', category: 'personnages', genres: ['Drame'], likeCount: 5900, weeklyLikeDelta: 480, publishAt: inDays(-3),
    description: 'Portrait de Rin sous la pluie, un moment de calme avant la tempête.',
    hashtags: ['portrait', 'pluie', 'rin'], width: 2200, height: 3100, tools: 'Procreate', license: '© Tous droits réservés' },
  { id: 'dr5-illus-6', title: "Étude d'encre #7", artistName: 'Yuki Moreau', artistAccountSlug: 'dr1-yuki-moreau', category: 'process', genres: [], likeCount: 1300, weeklyLikeDelta: 90, publishAt: inDays(-60),
    description: null, hashtags: [], width: null, height: null, tools: null, license: null },
  { id: 'dr5-illus-7', title: 'Couverture · Néon Sutra', artistName: 'Léa B.', category: 'couvertures', genres: ['Shōnen'], likeCount: 8100, weeklyLikeDelta: 610, publishAt: inDays(-1),
    description: "Couverture pour le tome 1 de Néon Sutra — jeu de contraste entre l'ombre du héros et les néons de la ville.",
    hashtags: ['couverture', 'neonsutra', 'ville'], width: 2480, height: 3508, tools: 'Encre · Photoshop', license: '© Tous droits réservés' },
  { id: 'dr5-illus-8', title: "Masque de l'oni", artistName: 'Inès Khelifi', category: 'personnages', genres: ['Yōkai'], likeCount: 4600, weeklyLikeDelta: 380, publishAt: inDays(-20),
    description: "Étude de masque d'oni traditionnel, revisité avec une palette plus sombre.",
    hashtags: ['oni', 'masque', 'yokai'], width: 2000, height: 2600, tools: 'Procreate', license: '© Tous droits réservés' },
  { id: 'dr5-illus-9', title: 'Ruelles de Kowloon', artistName: 'Hugo Da Silva', category: 'decors', genres: ['Cyberpunk'], likeCount: 2800, weeklyLikeDelta: 220, publishAt: inDays(-25),
    description: 'Décor inspiré de la Cité close de Kowloon — enchevêtrement de câbles, enseignes et linge suspendu.',
    hashtags: ['decor', 'cyberpunk', 'kowloon'], width: 3200, height: 2100, tools: 'Photoshop', license: '© Tous droits réservés' },
  { id: 'dr5-illus-10', title: 'Fan-art · Le Dernier Ronin', artistName: 'Sasha N.', category: 'fanart', genres: ['Seinen'], likeCount: 6200, weeklyLikeDelta: 520, publishAt: inDays(-5),
    description: 'Fan-art réalisé en hommage à la série Le Dernier Ronin.', hashtags: ['fanart', 'ronin'], width: 2100, height: 2970, tools: 'Clip Studio Paint', license: '© Tous droits réservés — fan-art non commercial' },
  { id: 'dr5-illus-11', title: "Carnet d'encre · planche 12", artistName: 'Yuki Moreau', artistAccountSlug: 'dr1-yuki-moreau', category: 'process', genres: [], likeCount: 980, weeklyLikeDelta: 60, publishAt: inDays(-70),
    description: 'Extrait du carnet de croquis — planche 12, étude de mouvement.',
    hashtags: ['carnet', 'croquis', 'process'], width: 1800, height: 2400, tools: 'Encre', license: '© Tous droits réservés' },
  { id: 'dr5-illus-12', title: "Spectre d'avril", artistName: 'Camille D.', category: 'personnages', genres: ['Fantastique', 'Horreur'], likeCount: 3000, weeklyLikeDelta: 260, publishAt: inDays(-35),
    description: "Illustration d'un spectre errant, ambiance printanière inquiétante.",
    hashtags: ['spectre', 'fantastique'], width: 2000, height: 2800, tools: 'Procreate', license: '© Tous droits réservés' },
  { id: 'dr5-illus-13', title: 'Geisha mécanique', artistName: 'Mira K.', category: 'personnages', genres: ['Steampunk'], likeCount: 7300, weeklyLikeDelta: 590, publishAt: inDays(-2),
    description: 'Geisha steampunk, rouages et kimono traditionnel réinventés.',
    hashtags: ['steampunk', 'geisha'], width: 2200, height: 3100, tools: 'Photoshop', license: '© Tous droits réservés' },
  { id: 'dr5-illus-14', title: 'Forêt de bambous', artistName: 'Léa B.', category: 'decors', genres: ['Aventure'], likeCount: 1900, weeklyLikeDelta: 150, publishAt: inDays(-50),
    description: 'Décor de forêt de bambous baignée de lumière — étude de perspective et de profondeur.',
    hashtags: ['decor', 'bambous', 'foret'], width: 3000, height: 2000, tools: 'Photoshop', license: '© Tous droits réservés' },
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
    // DR-3: city 'Lyon' matches the prototype's "Scénariste · Lyon" / "Dessinateur · Lyon" sidebar rows.
    await prisma.profile.upsert({
      where: { accountId: account.id },
      create: { accountId: account.id, creatorRoles: [c.role], trendingScore: 100, city: 'Lyon' },
      update: { creatorRoles: [c.role], trendingScore: 100, city: 'Lyon' },
    });
  }

  // DR-3: wire the creative team (WorkCreator) onto the showcase manga.
  for (const wc of WORK_CREATORS) {
    const work = await prisma.work.findUnique({ where: { slug: wc.workSlug } });
    const account = await prisma.account.findUnique({ where: { profileSlug: wc.accountSlug } });
    if (!work || !account) continue;
    await prisma.workCreator.upsert({
      where: { workId_accountId: { workId: work.id, accountId: account.id } },
      create: { workId: work.id, accountId: account.id, role: wc.role, order: wc.order },
      update: { role: wc.role, order: wc.order },
    });
  }

  // DR-3: published chapters, planches, funding goals, reviews for the showcase manga(s).
  // Each list is cleared and recreated per work (scoped) so reseeding never accumulates duplicates.
  for (const [slug, chapters] of Object.entries(WORK_CHAPTERS)) {
    const work = await prisma.work.findUnique({ where: { slug } });
    if (!work) continue;
    // DR-11: ReadingProgress FK's to Chapter (no cascade) — delete stale progress rows on the
    // about-to-be-wiped chapters first, otherwise this deleteMany 500s once any account (seeded
    // or live-tested) has read a chapter here. READING_PROGRESS below recreates fresh rows against
    // the new chapter ids later in this same run.
    const staleChapters = await prisma.chapter.findMany({ where: { workId: work.id, status: 'published' }, select: { id: true } });
    if (staleChapters.length) {
      await prisma.readingProgress.deleteMany({ where: { chapterId: { in: staleChapters.map((c) => c.id) } } });
    }
    await prisma.chapter.deleteMany({ where: { workId: work.id, status: 'published' } });
    for (const c of chapters) {
      await prisma.chapter.create({
        data: {
          workId: work.id,
          number: c.number,
          title: c.title,
          status: 'published',
          publishAt: c.publishAt,
          plancheCount: c.plancheCount,
          likeCount: c.likeCount,
          premium: c.premium ?? false,
          prose: c.prose ?? null,
        },
      });
    }
  }

  // DR-4: reader pages (Planche rows with chapterId set) for the showcase manga's free chapters.
  // Cleared+recreated per chapter (scoped by chapterId, not workId, so this never touches the
  // DR-3 work-level grid planches created above).
  for (const [slug, chapterPages] of Object.entries(CHAPTER_PAGES)) {
    const work = await prisma.work.findUnique({ where: { slug } });
    if (!work) continue;
    for (const [number, pages] of Object.entries(chapterPages)) {
      const chapter = await prisma.chapter.findFirst({ where: { workId: work.id, number: Number(number) } });
      if (!chapter) continue;
      await prisma.planche.deleteMany({ where: { chapterId: chapter.id } });
      for (const p of pages) {
        await prisma.planche.create({ data: { workId: work.id, chapterId: chapter.id, caption: p.caption, order: p.order } });
      }
    }
  }

  // DR-4: favorites for the "★ MES FAVORIS" quick-switch (read-only this round; DR-9 owns toggling).
  for (const f of FAVORITES) {
    const account = await prisma.account.findUnique({ where: { profileSlug: f.accountSlug } });
    const work = await prisma.work.findUnique({ where: { slug: f.workSlug } });
    if (!account || !work) continue;
    await prisma.favorite.upsert({
      where: { accountId_workId: { accountId: account.id, workId: work.id } },
      create: { accountId: account.id, workId: work.id },
      update: {},
    });
  }

  // DR-11: reading-history/resume fixtures — upsert on the model's own unique key so reseeding
  // never accumulates duplicates or clobbers other accounts' progress.
  for (const rp of READING_PROGRESS) {
    const account = await prisma.account.findUnique({ where: { profileSlug: rp.accountSlug } });
    const work = await prisma.work.findUnique({ where: { slug: rp.workSlug } });
    if (!account || !work) continue;
    const chapter = await prisma.chapter.findFirst({ where: { workId: work.id, number: rp.chapterNumber } });
    if (!chapter) continue;
    await prisma.readingProgress.upsert({
      where: { accountId_chapterId: { accountId: account.id, chapterId: chapter.id } },
      create: { accountId: account.id, chapterId: chapter.id, workId: work.id, page: rp.page },
      update: { page: rp.page },
    });
  }

  for (const [slug, planches] of Object.entries(WORK_PLANCHES)) {
    const work = await prisma.work.findUnique({ where: { slug } });
    if (!work) continue;
    // DR-4: scoped to chapterId:null — these are work-level grid planches, distinct from the
    // chapterId-set reader pages created above; an unscoped deleteMany would wipe those too.
    await prisma.planche.deleteMany({ where: { workId: work.id, chapterId: null } });
    for (const p of planches) {
      await prisma.planche.create({ data: { workId: work.id, caption: p.caption, order: p.order } });
    }
  }

  for (const [slug, goals] of Object.entries(WORK_FUNDING_GOALS)) {
    const work = await prisma.work.findUnique({ where: { slug } });
    if (!work) continue;
    await prisma.fundingGoal.deleteMany({ where: { workId: work.id } });
    for (const g of goals) {
      await prisma.fundingGoal.create({ data: { workId: work.id, title: g.title, currentCents: g.currentCents, targetCents: g.targetCents, order: g.order } });
    }
  }

  for (const [slug, reviews] of Object.entries(WORK_REVIEWS)) {
    const work = await prisma.work.findUnique({ where: { slug } });
    if (!work) continue;
    await prisma.review.deleteMany({ where: { workId: work.id } });
    for (const r of reviews) {
      await prisma.review.create({ data: { workId: work.id, authorName: r.authorName, storyRating: r.storyRating, artRating: r.artRating, text: r.text } });
    }
  }

  // DR-5: gallery "Galerie" illustrations. Upserted by explicit `id` (same pattern as CONTESTS —
  // Illustration has no other natural unique field) so re-seeding never accumulates duplicates.
  for (const i of ILLUSTRATIONS) {
    const account = i.artistAccountSlug ? await prisma.account.findUnique({ where: { profileSlug: i.artistAccountSlug } }) : null;
    const data = {
      title: i.title,
      artistId: account ? account.id : null,
      artistName: i.artistName,
      category: i.category,
      genres: i.genres,
      image: null,
      width: i.width ?? null,
      height: i.height ?? null,
      description: i.description ?? null,
      hashtags: i.hashtags ?? [],
      tools: i.tools ?? null,
      license: i.license ?? null,
      likeCount: i.likeCount,
      weeklyLikeDelta: i.weeklyLikeDelta,
      publishedAt: i.publishAt,
    };
    await prisma.illustration.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }
}

main()
  .catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
