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
// F-22: single source of truth for hashtag shape — seeded tags match the BE `tag` filter & FE chips.
const { normalizeHashtags } = require('@encre-et-plume/shared');

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
  // DR-7: second Roman-format work — so the Classement "Romans" category tab has more than one
  // entry to order (the prototype-user-requested category tab, not just DR-2's format facet fixture).
  { slug: 'dr7-les-heures-de-verre', title: 'Les Heures de Verre', genre: 'Josei', meta: 'Sana K. · 6 ch.', likeCount: 900, weeklyLikeDelta: 0, priorWeekLikeDelta: 0, featuredRank: null, themes: ['Romance'], format: 'Roman', language: 'Français', audienceRating: 'Tous publics', complete: false, chapterCount: 6, ratingAvg: 4.1, publishedAt: inDays(-6), synopsis: 'Une horlogère répare le temps des autres et n’a jamais osé remonter le sien — jusqu’à ce qu’un client lui rapporte une montre qui s’arrête toujours à la même heure.', hashtags: ['roman', 'romance'] },
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
    // DR-9: likeCount includes the pre-active REACTIONS seed below (dr1-camille-roux already
    // likes chapter 1) — 1801, not 1800, so the counter isn't off-by-one on first toggle.
    { number: 1, title: 'Sous la pluie', plancheCount: 22, publishAt: new Date('2024-03-14'), likeCount: 1801, premium: false },
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

// DR-8: "Ma liste" (WatchlistItem) fixtures — same demo account as FAVORITES/READING_PROGRESS
// (dr1-camille-roux). 4 real works so the "Ma liste" tab count is 4 (like the prototype).
// `lames-de-brume` already has DR-11 ReadingProgress (ch.1 p.3) -> "Reprendre · Ch. 1 / 12" + bar;
// `neon-sutra` has no progress -> "Pas commencé". List/likes are not required to be disjoint.
const WATCHLIST = [
  { accountSlug: 'dr1-camille-roux', workSlug: 'lames-de-brume' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'onibi' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'neon-sutra' },
  { accountSlug: 'dr1-camille-roux', workSlug: 'dr2-le-murmure-des-cendres' },
];

// DR-9: pre-active Reaction fixtures (chapter/illustration `like` — the two target types with no
// per-user table; work like/save reuse the already-seeded FAVORITES/WATCHLIST above). Same demo
// account (dr1-camille-roux) so QA can see the active->inactive path immediately, not just
// inactive->active. WORK_CHAPTERS/ILLUSTRATIONS likeCount above already include these rows.
// Additive: a couple of `save` reactions too, so /ma-liste's "Illustrations" tabs (liked + saved)
// are non-empty out of the box for QA (dr5-illus-2 is liked-only, dr5-illus-1/7 are saved).
const REACTIONS = [
  { accountSlug: 'dr1-camille-roux', targetType: 'chapter', workSlug: 'lames-de-brume', chapterNumber: 1, kind: 'like' },
  { accountSlug: 'dr1-camille-roux', targetType: 'illustration', illustrationId: 'dr5-illus-1', kind: 'like' },
  { accountSlug: 'dr1-camille-roux', targetType: 'illustration', illustrationId: 'dr5-illus-2', kind: 'like' },
  { accountSlug: 'dr1-camille-roux', targetType: 'illustration', illustrationId: 'dr5-illus-1', kind: 'save' },
  { accountSlug: 'dr1-camille-roux', targetType: 'illustration', illustrationId: 'dr5-illus-7', kind: 'save' },
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
  // DR-9: likeCount includes the pre-active REACTIONS seed below (dr1-camille-roux already likes
  // this piece) — 12401, not 12400, so the counter isn't off-by-one on first toggle.
  { id: 'dr5-illus-1', title: 'Pluie de Néons', artistName: 'Yuki Moreau', artistAccountSlug: 'dr1-yuki-moreau', category: 'couvertures', genres: ['Shōnen', 'Aventure'], likeCount: 12401, weeklyLikeDelta: 900, publishAt: inDays(-8),
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
  // DR-10: genres includes 'Érotique' (genres.json id 'erotica', plus18:true) — gives the
  // illustration 18+ hard-gate (hasPlus18Genre) a fixture, distinct from Onibi/Gore above (mature
  // but NOT plus18 — never blurred, only warning-tagged).
  { id: 'dr10-illus-plus18', title: 'Nuit close', artistName: 'Camille D.', category: 'personnages', genres: ['Érotique'], likeCount: 640, weeklyLikeDelta: 40, publishAt: inDays(-12),
    description: 'Illustration réservée aux adultes (18+) — fixture DR-10 pour le hard-gate illustration.',
    hashtags: ['mature'], width: 2000, height: 2800, tools: 'Procreate', license: '© Tous droits réservés' },
];

// Top artiste/scénariste du moment — also the (fictional) creative duo behind "Lames de Brume".
// DR-10: birthdate seeded as adult (isAdult:true) — dr1-camille-roux is the login-tested account
// (FAVORITES/READING_PROGRESS/WATCHLIST/REACTIONS above), so it must be age-cleared by default.
const CREATORS = [
  { email: 'yuki.moreau@seed.encre-et-plume.local', displayName: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'dessinateur', birthdate: new Date('1996-04-12'), country: 'FR', region: 'Auvergne-Rhône-Alpes', availability: 'ouvert', tags: ['Seinen', 'Encre dense'] },
  // MC-2: Camille is the login-tested suggestions viewer. Genre 'Seinen' + style 'Ambiances urbaines',
  // plus seeking prefs so Théo M. tops her suggestions with "même genre · rythme compatible".
  { email: 'camille.roux@seed.encre-et-plume.local', displayName: 'Camille Roux', slug: 'dr1-camille-roux', role: 'scenariste', birthdate: new Date('1994-09-03'), country: 'FR', region: 'Auvergne-Rhône-Alpes', availability: 'ouvert', tags: ['Seinen', 'Ambiances urbaines'], seekingProjectLength: 'projet long', seekingTargetRole: 'dessinateur' },
];

// MC-1 "Trouver un·e partenaire" directory fixtures. Each seeds an Account+Profile (creator role) +
// 2 PortfolioItems. Tags mix F-20 genre labels (→ genreTags) and free style words (→ styleTags).
// Region/availability/genre variety gives every filter a discriminating fixture (plan B6).
const PARTNERS = [
  // MC-2: 'projet long' matches Camille's rhythm → Théo tops her suggestions (score 75, "même genre · rythme compatible").
  { email: 'theo.m@seed.encre-et-plume.local', displayName: 'Théo M.', slug: 'mc1-theo-m', role: 'dessinateur', country: 'FR', region: 'Auvergne-Rhône-Alpes', availability: 'disponible', tags: ['Seinen', 'Encre dense'], trendingScore: 90, seekingProjectLength: 'projet long' },
  { email: 'ines.k@seed.encre-et-plume.local', displayName: 'Inès K.', slug: 'mc1-ines-k', role: 'dessinateur', country: 'FR', region: 'Île-de-France', availability: 'ouvert', tags: ['Josei', 'Aquarelle'], trendingScore: 80 },
  { email: 'hugo.d@seed.encre-et-plume.local', displayName: 'Hugo D.', slug: 'mc1-hugo-d', role: 'dessinateur', country: 'FR', region: 'Bretagne', availability: 'ouvert', tags: ['Fantastique', 'Action'], trendingScore: 70 },
  { email: 'lea.b@seed.encre-et-plume.local', displayName: 'Léa B.', slug: 'mc1-lea-b', role: 'scenariste', country: 'FR', region: 'Occitanie', availability: 'disponible', tags: ['Seinen', 'Thriller', 'Dialogues ciselés'], trendingScore: 65 },
  // MC-2: shares Camille's style tag 'Ambiances urbaines' but no genre → style-only suggestion (score 25, "style proche de vos refs").
  { email: 'noe.p@seed.encre-et-plume.local', displayName: 'Noé P.', slug: 'mc1-noe-p', role: 'scenariste', country: 'FR', region: 'Provence-Alpes-Côte d\'Azur', availability: 'ouvert', tags: ['Romance', 'Comédie', 'Ambiances urbaines'], trendingScore: 60 },
  { email: 'sora.t@seed.encre-et-plume.local', displayName: 'Sora T.', slug: 'mc1-sora-t', role: 'dessinateur', country: 'JP', region: null, availability: 'ouvert', tags: ['Shōnen', 'Action', 'Ligne claire'], trendingScore: 55 },
  { email: 'marta.l@seed.encre-et-plume.local', displayName: 'Marta L.', slug: 'mc1-marta-l', role: 'dessinateur', country: 'ES', region: null, availability: 'indisponible', tags: ['Horreur', 'Lavis'], trendingScore: 50 },
  { email: 'diego.s@seed.encre-et-plume.local', displayName: 'Diego S.', slug: 'mc1-diego-s', role: 'scenariste', country: 'AR', region: null, availability: 'ouvert', tags: ['Aventure', 'SF'], trendingScore: 45 },
];

// MC-4 "Appels à projets" board rows (the prototype's three examples, full data) + a closed call
// and a call owned by the login-tested e2e account (dr1-camille-roux) for the "own call → no
// Candidater" and "closed → Clôturé" states. `authorSlug` (when set) resolves to the owner's
// Account id at seed time. Genres are GENRES ids (F-20); `tags` are the denormalized display chips.
// `createdAt` is EXPLICIT and spread a full minute apart (oldest first, array order) — `GET /calls`
// orders by `createdAt desc`, and relying on the implicit `now()` at insert time is non-deterministic
// (a fresh-seeded CI DB and a locally reseeded one can insert fast enough to tie or reorder). Fixed,
// minute-spaced timestamps make ordering identical on every fresh seed AND every reseed.
const inMinutes = (n) => new Date(Date.now() - 60 * 60 * 1000 + n * 60 * 1000);
const PROJECT_CALLS = [
  {
    title: '« Lames de Brume »', authorRole: 'scenariste', seekingRoles: ['dessinateur'], authorName: 'Camille R.',
    genres: ['seinen', 'thriller'], scope: '~120 planches', tags: ['Seinen', 'Thriller', '~120 planches'],
    description: "Un thriller urbain mélancolique. J'ai 6 chapitres écrits, je cherche un trait à l'encre dense pour porter l'ambiance pluvieuse.",
    closesAt: inDays(12), applicationCount: 0, status: 'open', createdAt: inMinutes(0),
  },
  {
    title: 'One-shot fantastique', authorRole: 'dessinateur', seekingRoles: ['scenariste'], authorName: 'Théo M.',
    genres: ['supernatural'], format: 'one_shot', tags: ['Fantastique', 'One-shot'],
    description: "J'ai le character design et l'univers d'un monde de brume. Il me manque l'histoire — cherche un·e scénariste pour un one-shot de 40 pages.",
    closesAt: null, applicationCount: 5, status: 'open', createdAt: inMinutes(1),
  },
  {
    title: 'Comédie romantique', authorRole: 'scenariste', seekingRoles: ['dessinateur'], authorName: 'Maya L.',
    genres: ['josei', 'romance'], tags: ['Josei', 'Romance'],
    description: 'Série courte feel-good, trait rond et chaleureux souhaité. 8 chapitres prévus.',
    closesAt: inDays(20), applicationCount: 2, status: 'open', createdAt: inMinutes(2),
  },
  {
    // Closed call → renders "Clôturé", no "Candidater".
    title: 'Recueil horrifique', authorRole: 'dessinateur', seekingRoles: ['scenariste'], authorName: 'Marta L.',
    genres: ['horror'], format: 'one_shot', tags: ['Horreur', 'One-shot'],
    description: 'Anthologie de courtes histoires d’épouvante — appel clos, merci à toutes et tous.',
    closesAt: inDays(-3), applicationCount: 9, status: 'closed', createdAt: inMinutes(3),
  },
  {
    // Owned by the login-tested account → viewer sees no "Candidater" on their own call.
    // Newest of the 5 (createdAt inMinutes(4)) — the /trouver preview band (limit=2, newest-first)
    // deterministically surfaces this one; trouver.spec.ts MC1-E9 asserts on it explicitly.
    title: 'Seinen urbain', authorRole: 'scenariste', seekingRoles: ['dessinateur'], authorName: 'Camille Roux', authorSlug: 'dr1-camille-roux',
    genres: ['seinen'], scope: '~90 planches', tags: ['Seinen', '~90 planches'],
    description: 'Récit choral dans un Lyon nocturne. Scénario prêt, je cherche un·e dessinateur·rice pour un partenariat au long cours.',
    closesAt: inDays(30), applicationCount: 1, status: 'open', createdAt: inMinutes(4),
  },
  // MC-6 "Mes candidatures": three calls the dedicated MC6_APPLICANT_ACCOUNT has applied to (one
  // per status; QA fix — was dr1-camille-roux, moved to stop racing mc5-apply-call.spec.ts's
  // camille mutations under parallel Playwright workers). Kept
  // deliberately OLDEST (inMinutes negative → bottom of the createdAt-desc board) so the /trouver
  // preview's newest-2 window is untouched, and ALL seekingRole:'scenariste' + non-seinen genres so
  // the appels.spec role/genre filter counts (dessinateur→3, seinen→2) stay valid. They DO grow the
  // default board total (status:'all') from 5 to 8 — appels.spec's total-count assertions are bumped
  // accordingly. Explicit ids so the applications below can reference them.
  {
    id: 'mc6-call-fantastique', title: 'Récit fantastique', authorRole: 'dessinateur', seekingRoles: ['scenariste'], authorName: 'Théo M.',
    genres: ['supernatural'], format: 'one_shot', tags: ['Fantastique', 'One-shot'],
    description: "Univers de brume et de spectres, character design prêt — cherche un·e scénariste pour lui donner une histoire.",
    closesAt: inDays(15), applicationCount: 1, status: 'open', createdAt: inMinutes(-1),
  },
  {
    id: 'mc6-call-comedie', title: 'Comédie douce-amère', authorRole: 'dessinateur', seekingRoles: ['scenariste'], authorName: 'Maya L.',
    genres: ['josei', 'romance'], tags: ['Josei', 'Romance'],
    description: 'Série courte feel-good, trait rond et chaleureux — je cherche une plume pour porter les dialogues.',
    closesAt: inDays(22), applicationCount: 1, status: 'open', createdAt: inMinutes(-2),
  },
  {
    id: 'mc6-call-aventure', title: 'Aventure onirique', authorRole: 'dessinateur', seekingRoles: ['scenariste'], authorName: 'Sora K.',
    genres: ['adventure'], tags: ['Aventure'],
    description: 'Un voyage initiatique à travers des mondes flottants — décors posés, il me manque le récit.',
    closesAt: inDays(28), applicationCount: 1, status: 'open', createdAt: inMinutes(-3),
  },
  // MC-7 "Mes appels à projets": one call OWNED by the login-tested MC7_OWNER_ACCOUNT with 3 received
  // applications (seeded below). authorSlug → the owner Account id so the account owns it. Kept OLDEST
  // (createdAt inMinutes(-4)) so the /trouver newest-2 preview window is untouched, and
  // seekingRoles:['scenariste'] + genre 'action' (non-seinen) so appels.spec's dessinateur→3 / seinen→2
  // filter counts stay valid. Grows the default board total (status:'all') by 1 — appels.spec bumped.
  {
    id: 'mc7-call-nocturne', title: 'Polar nocturne', authorSlug: 'mc7-appels-fixture', authorName: 'Testeur Appels (MC-7)',
    authorRole: 'dessinateur', seekingRoles: ['scenariste'], genres: ['action'], tags: ['Action'],
    description: 'Un polar urbain sous la pluie — décors et personnages posés, il me manque la plume.',
    closesAt: inDays(25), applicationCount: 3, status: 'open', createdAt: inMinutes(-4),
  },
  // MC-7 round 3: a SECOND call owned by MC7_OWNER_ACCOUNT, older than nocturne (so nocturne stays
  // the selector's default selection — round-2 E1 assertions untouched) and with exactly one PENDING
  // application (F7: a call needs ≥1 application to appear in the MC-7 selector at all). Zero
  // accepted applications ⇒ safe to edit/delete without hitting the accepted-applicant 409 guard —
  // this is the fixture the round-3 edit/delete e2e (E10/E11) exercises. genre 'action' (same
  // no-filter-ripple choice as nocturne). Grows the default board total (status:'all') by a further 1.
  {
    id: 'mc7-call-brouillon', title: "Brouillon d'été", authorSlug: 'mc7-appels-fixture', authorName: 'Testeur Appels (MC-7)',
    authorRole: 'dessinateur', seekingRoles: ['scenariste'], genres: ['action'], tags: ['Action'],
    description: 'Idée encore en chantier — un carnet de voyage estival, il me manque la plume pour le texte.',
    closesAt: inDays(20), applicationCount: 1, status: 'open', createdAt: inMinutes(-10),
  },
];

// MC-6: the dedicated MC6_APPLICANT_ACCOUNT's own applications, one per status, to the three
// mc6-call-* calls above.
// Statuses are seeded directly (MC-7's accept/reject PATCH doesn't exist yet). Distinct createdAt
// (newest-first: pending → accepted → rejected) so the "Mes candidatures" order is assertable.
const MY_APPLICATIONS = [
  { callId: 'mc6-call-fantastique', status: 'pending', createdAt: inDays(-2) },
  { callId: 'mc6-call-comedie', status: 'accepted', createdAt: inDays(-5) },
  { callId: 'mc6-call-aventure', status: 'rejected', createdAt: inDays(-9) },
];

// MC-3 (CS-1 seam): the sender's projects for the invite modal picker (prototype fixtures).
const PROJECTS = [
  { id: 'mc3-proj-lames-de-brume', title: 'Lames de Brume', kind: 'Manga', genre: 'Seinen', status: 'en cours' },
  { id: 'mc3-proj-spectres-avril', title: "Spectres d'Avril", kind: 'Manga', genre: 'Fantastique', status: 'en révision' },
  { id: 'mc3-proj-carnet-encre', title: "Carnet d'encre", kind: 'Illustration(s)', genre: null, status: 'en cours' },
];

// MC-2: a loginable creator with an EMPTY tag/genre profile — exercises the minimum-data guard
// (GET /matches/suggestions → { items: [], incompleteProfile: true }, "Complétez votre profil…").
const MC2_SPARSE_ACCOUNT = {
  email: 'mc2.sansprofil@seed.encre-et-plume.local',
  displayName: 'Sans Profil (MC-2)',
  slug: 'mc2-sans-profil',
  role: 'dessinateur',
};

// DR-10: a real, loginable minor test account (password `password123`, like dr1-camille-roux) —
// isAdult:false so QA/e2e can exercise the "logged-in minor" 403/refusal branch of the age gate
// without inventing a new login helper. No creator profile/role: a plain reader account.
const MINOR_ACCOUNT = {
  email: 'minor.testeur@seed.encre-et-plume.local',
  displayName: 'Compte Mineur (test)',
  slug: 'dr10-minor-testeur',
  birthdate: new Date(new Date().getFullYear() - 12, 0, 1), // ~12 years old, always a minor
};

// MC-6: a dedicated login-tested account for "Mes candidatures" e2e (mc6-mes-candidatures.spec.ts).
// QA fix: this used to reuse dr1-camille-roux, but camille is ALSO mc5-apply-call.spec.ts's dedicated
// account (it applies to "One-shot fantastique" there) — when Playwright runs spec files in parallel
// workers (CI default), both specs mutated/read camille's application list concurrently, racing the
// mc6 exact-count assertions ("Toutes · 3" etc.). Standalone (not in PARTNERS/CREATORS — those feed
// directory-listing count assertions in trouver.spec.ts) so adding it can't perturb other suites.
const MC6_APPLICANT_ACCOUNT = {
  email: 'candidatures.mc6@seed.encre-et-plume.local',
  displayName: 'Testeuse Candidatures (MC-6)',
  slug: 'mc6-candidatures-fixture',
  role: 'scenariste',
};

// MC-7: a dedicated login-tested call OWNER for "Mes appels à projets" e2e
// (mc7-candidatures-recues.spec.ts). Standalone (NOT in PARTNERS/CREATORS — those feed directory
// count assertions) so it can't perturb other suites. Owns one call (mc7-call-nocturne) that three
// scénariste seed accounts have applied to; the spec logs in as this account and accepts/rejects.
const MC7_OWNER_ACCOUNT = {
  email: 'appels.mc7@seed.encre-et-plume.local',
  displayName: 'Testeur Appels (MC-7)',
  slug: 'mc7-appels-fixture',
  role: 'dessinateur',
};

// MC-7: the three applications received on mc7-call-nocturne, from existing scénariste seed accounts
// (distinct applicants — @@unique([callId, applicantId])). Statuses seeded directly; the accept/reject
// e2e mutates two of them (the seed wipe resets on every reseed → repeatable). Distinct createdAt so
// the newest-first row order is assertable.
const MC7_RECEIVED = [
  { callId: 'mc7-call-nocturne', applicantSlug: 'mc1-lea-b', status: 'pending', createdAt: inDays(-1),
    message: "Vos ambiances nocturnes collent à mon écriture — 6 chapitres d'un polar lyonnais déjà maquettés." },
  { callId: 'mc7-call-nocturne', applicantSlug: 'mc1-noe-p', status: 'pending', createdAt: inDays(-3), message: '' },
  { callId: 'mc7-call-nocturne', applicantSlug: 'mc1-diego-s', status: 'rejected', createdAt: inDays(-6),
    message: "Un pitch SF à tiroirs, si le polar peut glisser vers l'anticipation." },
  // MC-7 round 3: the one pending application on mc7-call-brouillon (F7 — a zero-application call
  // never appears in the MC-7 selector). Diego reused as the applicant: he's already an MC-7 seed
  // account with a portfolio, and grepped confirmed no e2e spec asserts his own "Mes candidatures"
  // count anywhere, so a second application under his name can't perturb another suite.
  { callId: 'mc7-call-brouillon', applicantSlug: 'mc1-diego-s', status: 'pending', createdAt: inDays(-2),
    message: 'Un carnet illustré, je peux poser le texte de voyage qui va avec.' },
];

// MC-8 "Contacts & connexions": a dedicated login-tested account for the e2e (mc8-contacts.spec.ts).
// Standalone (NOT in PARTNERS/CREATORS — those feed directory count assertions). Its connections reuse
// existing MC-1 partner creators so no extra accounts are minted.
const MC8_ACCOUNT = {
  email: 'contacts.mc8@seed.encre-et-plume.local',
  displayName: 'Camille R.',
  slug: 'mc8-contacts-fixture',
  role: 'scenariste',
  city: 'Paris',
};

// MC-8 fixtures keyed by the OTHER party's partner slug:
//  - 2 accepted → the Contacts tab shows 2 rows.
//  - 2 pending incoming (from → MC8_ACCOUNT) → the Demandes badge shows [2].
const MC8_ACCEPTED = ['mc1-lea-b', 'mc1-hugo-d'];
const MC8_PENDING_FROM = [
  { slug: 'mc1-noe-p', context: 'souhaite se connecter' },
  { slug: 'mc1-diego-s', context: 'souhaite se connecter' },
];

async function main() {
  const hash = bcrypt.hashSync('password123', 10);

  // F-13: current published cgu/privacy versions (seeded by the f13_legal_consent migration) — used
  // below to give every loginable seed account a ConsentRecord so needsCguReconsent === false. Without
  // this, a fresh DB leaves the CguReconsentModal's full-viewport backdrop mounted after login, which
  // blocks every click in e2e (mirrors the same guard already in e2e-seed.js).
  const cguDoc = await prisma.legalDocument.findFirst({ where: { kind: 'cgu' }, orderBy: { publishedAt: 'desc' } });
  const privacyDoc = await prisma.legalDocument.findFirst({ where: { kind: 'privacy' }, orderBy: { publishedAt: 'desc' } });
  async function ensureConsent(accountId) {
    for (const [kind, doc] of [['cgu', cguDoc], ['privacy', privacyDoc]]) {
      if (!doc) continue;
      const existing = await prisma.consentRecord.findFirst({ where: { accountId, document: kind, version: doc.version } });
      if (!existing) await prisma.consentRecord.create({ data: { accountId, document: kind, version: doc.version } });
    }
  }

  for (const w of WORKS) {
    const work = await prisma.work.upsert({ where: { slug: w.slug }, create: w, update: w });

    const chapter = SCHEDULED_CHAPTERS.find((c) => c.workSlug === w.slug);
    if (chapter) {
      // Clear + recreate so reseeding doesn't accumulate duplicate scheduled chapters.
      // Clear dependent ReadingProgress/Reaction rows first (same guard as the published-chapter
      // block below) — without it the deleteMany 500s on ReadingProgress_chapterId_fkey once any
      // account has opened a scheduled chapter on a re-run over an existing DB.
      const staleScheduled = await prisma.chapter.findMany({ where: { workId: work.id, status: 'scheduled' }, select: { id: true } });
      if (staleScheduled.length) {
        const ids = staleScheduled.map((c) => c.id);
        await prisma.readingProgress.deleteMany({ where: { chapterId: { in: ids } } });
        await prisma.reaction.deleteMany({ where: { targetType: 'chapter', targetId: { in: ids } } });
      }
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
      // emailVerifiedAt must be set at creation (F-11 blocks login otherwise) — a genuinely fresh
      // DB hits this `create` branch and camille.roux (the login-tested e2e fixture) was otherwise
      // stuck unverified, 403-ing every login and stalling every e2e spec that signs in as her.
      create: { email: c.email, displayName: c.displayName, passwordHash: hash, profileSlug: c.slug, role: 'utilisateur', birthdate: c.birthdate, emailVerifiedAt: new Date() },
      update: { displayName: c.displayName, profileSlug: c.slug, birthdate: c.birthdate },
    });
    await ensureConsent(account.id);
    // DR-3: city 'Lyon' matches the prototype's "Scénariste · Lyon" / "Dessinateur · Lyon" sidebar rows.
    // MC-1: country/region/availability/tags so these creators also appear in the partner directory.
    const creatorProfile = { accountId: account.id, creatorRoles: [c.role], trendingScore: 100, city: 'Lyon', country: c.country, region: c.region, availability: c.availability, tags: c.tags, seekingProjectLength: c.seekingProjectLength ?? null, seekingTargetRole: c.seekingTargetRole ?? null };
    await prisma.profile.upsert({
      where: { accountId: account.id },
      create: creatorProfile,
      update: creatorProfile,
    });
  }

  // MC-5: the login-tested e2e account (dr1-camille-roux) applies to a call via the portfolio path,
  // so ensure she has 2 selectable PortfolioItems. Clear + recreate so reseeding never duplicates.
  {
    const acc = await prisma.account.findUnique({ where: { profileSlug: 'dr1-camille-roux' }, select: { id: true } });
    const prof = acc && (await prisma.profile.findUnique({ where: { accountId: acc.id }, select: { id: true } }));
    if (prof) {
      await prisma.portfolioItem.deleteMany({ where: { profileId: prof.id } });
      for (let i = 0; i < 2; i++) {
        await prisma.portfolioItem.create({
          data: { profileId: prof.id, image: `https://example.com/portfolio/dr1-camille-roux-${i}.jpg`, caption: `Échantillon ${i + 1}`, order: i },
        });
      }
    }
  }

  // MC-6: dedicated "Mes candidatures" e2e account (see MC6_APPLICANT_ACCOUNT comment above for why
  // it's not dr1-camille-roux) + 2 PortfolioItems (same pattern as camille's above, needed for the
  // apply modal's portfolio-pick path in mc6-mes-candidatures.spec.ts's reapply test). Must run
  // before the MC-6 applications block below, which looks this account up.
  {
    const account = await prisma.account.upsert({
      where: { email: MC6_APPLICANT_ACCOUNT.email },
      create: { email: MC6_APPLICANT_ACCOUNT.email, displayName: MC6_APPLICANT_ACCOUNT.displayName, passwordHash: hash, profileSlug: MC6_APPLICANT_ACCOUNT.slug, role: 'utilisateur', emailVerifiedAt: new Date() },
      update: { displayName: MC6_APPLICANT_ACCOUNT.displayName, profileSlug: MC6_APPLICANT_ACCOUNT.slug, emailVerifiedAt: new Date() },
    });
    await ensureConsent(account.id);
    const profileData = { accountId: account.id, creatorRoles: [MC6_APPLICANT_ACCOUNT.role] };
    const profile = await prisma.profile.upsert({ where: { accountId: account.id }, create: profileData, update: profileData });
    await prisma.portfolioItem.deleteMany({ where: { profileId: profile.id } });
    for (let i = 0; i < 2; i++) {
      await prisma.portfolioItem.create({
        data: { profileId: profile.id, image: `https://example.com/portfolio/${MC6_APPLICANT_ACCOUNT.slug}-${i}.jpg`, caption: `Échantillon ${i + 1}`, order: i },
      });
    }
  }

  // MC-7: dedicated login-tested call OWNER for "Mes appels à projets" e2e. Must run before the
  // PROJECT_CALLS loop below, which resolves mc7-call-nocturne's authorSlug → this account's id.
  {
    const account = await prisma.account.upsert({
      where: { email: MC7_OWNER_ACCOUNT.email },
      create: { email: MC7_OWNER_ACCOUNT.email, displayName: MC7_OWNER_ACCOUNT.displayName, passwordHash: hash, profileSlug: MC7_OWNER_ACCOUNT.slug, role: 'utilisateur', emailVerifiedAt: new Date() },
      update: { displayName: MC7_OWNER_ACCOUNT.displayName, profileSlug: MC7_OWNER_ACCOUNT.slug, emailVerifiedAt: new Date() },
    });
    await ensureConsent(account.id);
    const profileData = { accountId: account.id, creatorRoles: [MC7_OWNER_ACCOUNT.role] };
    await prisma.profile.upsert({ where: { accountId: account.id }, create: profileData, update: profileData });
  }

  // MC-1: partner-directory creator fixtures (Account + Profile + 2 PortfolioItems each).
  for (const p of PARTNERS) {
    const account = await prisma.account.upsert({
      where: { email: p.email },
      create: { email: p.email, displayName: p.displayName, passwordHash: hash, profileSlug: p.slug, role: 'utilisateur', emailVerifiedAt: new Date() },
      update: { displayName: p.displayName, profileSlug: p.slug },
    });
    await ensureConsent(account.id);
    const profileData = { accountId: account.id, creatorRoles: [p.role], trendingScore: p.trendingScore, country: p.country, region: p.region, availability: p.availability, tags: p.tags, seekingProjectLength: p.seekingProjectLength ?? null };
    const profile = await prisma.profile.upsert({
      where: { accountId: account.id },
      create: profileData,
      update: profileData,
    });
    // Clear + recreate 2 ordered portfolio thumbs so reseeding never accumulates duplicates.
    await prisma.portfolioItem.deleteMany({ where: { profileId: profile.id } });
    for (let i = 0; i < 2; i++) {
      await prisma.portfolioItem.create({
        data: { profileId: profile.id, image: `https://example.com/portfolio/${p.slug}-${i}.jpg`, order: i },
      });
    }
  }

  // MC-4: "Appels à projets" board rows. deleteMany + create (like ANNOUNCEMENTS) — no natural key.
  // `authorSlug` resolves to the owner's Account id so the login account owns one call.
  // MC-5: applications FK-reference calls (onDelete: Restrict), so wipe them first — this also resets
  // applicationCount to the fixture values below, keeping the MC-5 apply e2e repeatable across reseeds.
  // Optional-chained: the Application model ships with MC-5; older checkouts/CI clients lack it.
  // MC-4X: ApplicationAsset cascades on application delete; ProjectCallAsset cascades on call delete.
  // The explicit projectCallAsset.deleteMany is a no-op safety (Cascade covers it).
  await prisma.application?.deleteMany({});
  await prisma.projectCallAsset?.deleteMany({});
  await prisma.projectCall.deleteMany({});
  for (const call of PROJECT_CALLS) {
    // MC-4X §8: fixtures still declare authorRole + seekingRoles; derive authorRoles[] + 1 seat each.
    const { authorSlug, authorRole, ...data } = call;
    data.authorRoles = [authorRole];
    data.seats = Object.fromEntries((data.seekingRoles || []).map((r) => [r, 1]));
    if (authorSlug) {
      const owner = await prisma.account.findUnique({ where: { profileSlug: authorSlug }, select: { id: true } });
      data.authorId = owner?.id ?? null;
    }
    await prisma.projectCall.create({ data });
  }

  // MC-6: seed the dedicated MC6_APPLICANT_ACCOUNT's own applications (one per status) to the
  // mc6-call-* calls. Runs after her PortfolioItems exist (block above) — reuse her first one as
  // the denormalized sampleUrl. QA fix: moved off dr1-camille-roux (see MC6_APPLICANT_ACCOUNT
  // comment) to stop racing mc5-apply-call.spec.ts's camille mutations under parallel workers.
  {
    const applicant = await prisma.account.findUnique({ where: { profileSlug: MC6_APPLICANT_ACCOUNT.slug }, select: { id: true } });
    const profile = applicant && (await prisma.profile.findUnique({ where: { accountId: applicant.id }, select: { id: true } }));
    const sample = profile && (await prisma.portfolioItem.findFirst({ where: { profileId: profile.id }, orderBy: { order: 'asc' }, select: { id: true, image: true } }));
    if (applicant && sample) {
      for (const app of MY_APPLICATIONS) {
        // MC-4X: the sample now lives in ApplicationAsset (position 0); sampleUrl stays denormalized.
        await prisma.application.create({
          data: {
            callId: app.callId,
            applicantId: applicant.id,
            sampleUrl: sample.image,
            message: '',
            status: app.status,
            createdAt: app.createdAt,
            assets: {
              create: [{ portfolioItemId: sample.id, url: sample.image, kind: 'image', position: 0 }],
            },
          },
        });
      }
    }
  }

  // MC-7: seed the applications RECEIVED on the owner's calls (mc7-call-nocturne + round-3's
  // mc7-call-brouillon). Each applicant is an existing scénariste seed account with PortfolioItems
  // (created above); reuse its first one as the sample (position 0). appliedAs = 'scenariste' (both
  // calls' seekingRole).
  for (const app of MC7_RECEIVED) {
    const applicant = await prisma.account.findUnique({ where: { profileSlug: app.applicantSlug }, select: { id: true } });
    const profile = applicant && (await prisma.profile.findUnique({ where: { accountId: applicant.id }, select: { id: true } }));
    const sample = profile && (await prisma.portfolioItem.findFirst({ where: { profileId: profile.id }, orderBy: { order: 'asc' }, select: { id: true, image: true } }));
    if (applicant && sample) {
      await prisma.application.create({
        data: {
          callId: app.callId,
          applicantId: applicant.id,
          sampleUrl: sample.image,
          message: app.message,
          status: app.status,
          appliedAs: 'scenariste',
          createdAt: app.createdAt,
          assets: {
            create: [{ portfolioItemId: sample.id, url: sample.image, kind: 'image', position: 0 }],
          },
        },
      });
    }
  }

  // MC-8: the login-tested "Contacts & connexions" account + its network. Runs after PARTNERS (its
  // connections reference existing partner creators). Reset-safe: wipe the account's connections first.
  {
    const account = await prisma.account.upsert({
      where: { email: MC8_ACCOUNT.email },
      create: { email: MC8_ACCOUNT.email, displayName: MC8_ACCOUNT.displayName, passwordHash: hash, profileSlug: MC8_ACCOUNT.slug, role: 'utilisateur', emailVerifiedAt: new Date() },
      update: { displayName: MC8_ACCOUNT.displayName, profileSlug: MC8_ACCOUNT.slug, emailVerifiedAt: new Date() },
    });
    await ensureConsent(account.id);
    const profileData = { accountId: account.id, creatorRoles: [MC8_ACCOUNT.role], city: MC8_ACCOUNT.city };
    await prisma.profile.upsert({ where: { accountId: account.id }, create: profileData, update: profileData });

    // Idempotent reset: drop any connection touching this fixture account before recreating.
    await prisma.connection.deleteMany({ where: { OR: [{ requesterId: account.id }, { addresseeId: account.id }] } });

    const idBySlug = async (slug) => (await prisma.account.findUnique({ where: { profileSlug: slug }, select: { id: true } }))?.id;

    for (const slug of MC8_ACCEPTED) {
      const otherId = await idBySlug(slug);
      if (otherId) {
        await prisma.connection.create({
          data: { requesterId: account.id, addresseeId: otherId, status: 'accepted', respondedAt: new Date(), context: '' },
        });
      }
    }
    for (const p of MC8_PENDING_FROM) {
      const fromId = await idBySlug(p.slug);
      if (fromId) {
        await prisma.connection.create({
          data: { requesterId: fromId, addresseeId: account.id, status: 'pending', context: p.context },
        });
      }
    }
  }

  // MC-3 (CS-1 seam): projects owned by the login-tested sender (dr1-camille-roux) so the invite
  // modal's optional project picker renders. mc2-sans-profil stays project-less → empty-picker hint.
  // Idempotent: upsert on fixed ids. CS-1 will own real project creation.
  const camille = await prisma.account.findUnique({ where: { profileSlug: 'dr1-camille-roux' } });
  if (camille) {
    for (const p of PROJECTS) {
      const data = { ownerId: camille.id, title: p.title, kind: p.kind, genre: p.genre, status: p.status, cover: null };
      await prisma.project.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
    }
  }

  // DR-10: minor test account (no creator profile — a plain reader). emailVerifiedAt is set at
  // creation so it is immediately loginable (F-11 blocks login otherwise) for QA/e2e.
  const minorAccount = await prisma.account.upsert({
    where: { email: MINOR_ACCOUNT.email },
    create: {
      email: MINOR_ACCOUNT.email,
      displayName: MINOR_ACCOUNT.displayName,
      passwordHash: hash,
      profileSlug: MINOR_ACCOUNT.slug,
      role: 'utilisateur',
      birthdate: MINOR_ACCOUNT.birthdate,
      emailVerifiedAt: new Date(),
    },
    update: {
      displayName: MINOR_ACCOUNT.displayName,
      profileSlug: MINOR_ACCOUNT.slug,
      birthdate: MINOR_ACCOUNT.birthdate,
      emailVerifiedAt: new Date(),
    },
  });
  await ensureConsent(minorAccount.id);

  // MC-2: sparse-profile creator (creatorRoles set, but tags/seekingGenres empty) → suggestions empty state.
  {
    const account = await prisma.account.upsert({
      where: { email: MC2_SPARSE_ACCOUNT.email },
      create: { email: MC2_SPARSE_ACCOUNT.email, displayName: MC2_SPARSE_ACCOUNT.displayName, passwordHash: hash, profileSlug: MC2_SPARSE_ACCOUNT.slug, role: 'utilisateur', emailVerifiedAt: new Date() },
      update: { displayName: MC2_SPARSE_ACCOUNT.displayName, profileSlug: MC2_SPARSE_ACCOUNT.slug, emailVerifiedAt: new Date() },
    });
    await ensureConsent(account.id);
    const sparseProfile = { accountId: account.id, creatorRoles: [MC2_SPARSE_ACCOUNT.role], tags: [], seekingGenres: [] };
    await prisma.profile.upsert({ where: { accountId: account.id }, create: sparseProfile, update: sparseProfile });
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
    // DR-9: Reaction.targetId is a plain string (no FK), so it won't 500, but the chapter's id
    // changes on every reseed — without this, stale chapter-like Reaction rows would accumulate
    // forever. REACTIONS below recreates fresh rows against the new chapter ids.
    const staleChapters = await prisma.chapter.findMany({ where: { workId: work.id, status: 'published' }, select: { id: true } });
    if (staleChapters.length) {
      await prisma.readingProgress.deleteMany({ where: { chapterId: { in: staleChapters.map((c) => c.id) } } });
      await prisma.reaction.deleteMany({ where: { targetType: 'chapter', targetId: { in: staleChapters.map((c) => c.id) } } });
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

  // DR-8: "Ma liste" watchlist fixtures — upsert on the model's own unique key so reseeding never
  // accumulates duplicates.
  for (const w of WATCHLIST) {
    const account = await prisma.account.findUnique({ where: { profileSlug: w.accountSlug } });
    const work = await prisma.work.findUnique({ where: { slug: w.workSlug } });
    if (!account || !work) continue;
    await prisma.watchlistItem.upsert({
      where: { accountId_workId: { accountId: account.id, workId: work.id } },
      create: { accountId: account.id, workId: work.id },
      update: {},
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
      hashtags: normalizeHashtags(i.hashtags ?? []),
      tools: i.tools ?? null,
      license: i.license ?? null,
      likeCount: i.likeCount,
      weeklyLikeDelta: i.weeklyLikeDelta,
      publishedAt: i.publishAt,
    };
    await prisma.illustration.upsert({ where: { id: i.id }, create: { id: i.id, ...data }, update: data });
  }

  // DR-9: pre-active chapter/illustration Reaction fixtures — upsert on the model's own unique key
  // so reseeding never accumulates duplicates.
  for (const r of REACTIONS) {
    const account = await prisma.account.findUnique({ where: { profileSlug: r.accountSlug } });
    if (!account) continue;
    let targetId;
    if (r.targetType === 'chapter') {
      const work = await prisma.work.findUnique({ where: { slug: r.workSlug } });
      const chapter = work ? await prisma.chapter.findFirst({ where: { workId: work.id, number: r.chapterNumber } }) : null;
      targetId = chapter ? chapter.id : null;
    } else {
      targetId = r.illustrationId;
    }
    if (!targetId) continue;
    await prisma.reaction.upsert({
      where: { accountId_targetType_targetId_kind: { accountId: account.id, targetType: r.targetType, targetId, kind: r.kind } },
      create: { accountId: account.id, targetType: r.targetType, targetId, kind: r.kind },
      update: {},
    });
  }
}

main()
  .catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
