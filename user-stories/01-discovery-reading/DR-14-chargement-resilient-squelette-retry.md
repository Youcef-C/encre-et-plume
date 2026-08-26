# DR-14 — Chargement résilient : garder le squelette, réessayer, prévenir par toast

**As a** reader browsing works, **I want** a failed load to keep showing the skeleton while the app quietly retries, **so that** a flaky request doesn't turn the whole screen into a red error and hand me the recovery work.

> Screen(s): toutes les surfaces qui chargent des données — Accueil, Découvrir, Œuvre, Galerie, Classement, Ma liste, Profil, Illustration, et le reste de l'app · Priority: **Must** · Fidelity: **Inferred** (defect, not a drawn screen)

## Why this story exists (defect, not a feature)

When an œuvre fails to load, the app swaps its skeleton for a red `role="alert"` block —
« Impossible de charger le catalogue. Veuillez réessayer. » + un bouton « Réessayer ». Ce bloc est
**copié-collé ~12 fois** sur les surfaces œuvre :

`catalog/CatalogGrid.tsx:53`, `galerie/GalleryGrid.tsx:36`, `galerie/CollectionCardsGrid.tsx:34`,
`galerie/QuickPreview.tsx:113`, `AccueilClient.tsx:61`, `maliste/MaListeClient.tsx:83`,
`classement/ClassementClient.tsx:141`, `oeuvre/OeuvreClient.tsx:97`, `ProfileWorks.tsx:59`,
`ProfilePageClient.tsx:272`, `PortfolioGrid.tsx:50`, `illustration/IllustrationClient.tsx:87` —
et à nouveau ~10 fois ailleurs (notifications, candidatures, projets, appels, trouver, contacts…).

Une seule requête instable — une API froide, un tunnel, un 500 — rend donc l'écran entier alarmant
alors que la donnée serait revenue toute seule à la tentative suivante. La cause racine est qu'il
**n'existe aucun hook de fetch partagé** : chacun des ~30 composants ré-écrit à la main
`useState<'loading'|'ready'|'empty'|'error'>` + `useEffect` avec un drapeau `cancelled` et un
compteur `retryKey`. Le défaut existe à 12 endroits parce que le code existe à 12 endroits.

**Décision produit (2026-08-06)** : sur échec **transitoire**, le squelette **reste**, l'app réessaie
seule indéfiniment, et un **toast discret** informe l'utilisateur — le bloc rouge ne s'affiche plus
jamais dans ce cas.

## Frontend

### Règle centrale — transitoire vs terminal

Réessayer indéfiniment sur un 404 afficherait un squelette éternel pour une œuvre qui n'existe pas,
et [[DR-3]] exige justement une vue 404. Deux familles d'échec, donc :

- **Transitoire** — échec réseau (`TypeError`, donc **sans** `statusCode`), `408`, `429`, `5xx`, hors
  ligne → **le squelette reste**, nouvelle tentative automatique, toast. Jamais le bloc rouge.
- **Terminal** — tout autre `4xx` → **comportement actuel conservé** : `404` → la vue « introuvable »
  de l'écran, `401` → invite à se connecter ([[F-1]]), `403` → la barrière âge/privé ([[DR-10]]).
  Réessayer n'y changerait rien, l'app ne doit donc pas faire semblant.
- Le discriminant existe déjà : `lib/apiError.ts:15` distingue un vrai `ApiError` d'un `TypeError` de
  transport via `typeof err.statusCode === 'number'`. **Réutiliser ce test**, ne pas en écrire un second.

### Rythme des tentatives

- Backoff exponentiel avec gigue, plafonné, **nombre de tentatives illimité** : ~0,5 s · 1 s · 2 s ·
  4 s · 8 s · 16 s puis 30 s en boucle.
- Se caler sur les signaux natifs de la plateforme plutôt que de brûler des requêtes : **aucune**
  tentative tant que `document.visibilityState === 'hidden'` ou `navigator.onLine === false` ;
  tentative immédiate sur les évènements `online` et `visibilitychange`.
- Annulation à l'unmount (le drapeau `cancelled` actuel passe dans le hook).

### Le toast

`components/Toast.tsx` existe déjà (fixe en bas-centre, fond encre, ombre portée dure, `role="status"`
`aria-live="polite"`, le minuteur appartient à l'appelant) mais il est rendu par appelant et ne prend
qu'un message. Extension **minimale** :

- une prop optionnelle `action?: { label: string; onClick: () => void }`, rendue avec une classe
  d'intention `.ep-btn-compact--*` — **jamais** de couleur inline (règle boutons) — pour
  « Réessayer maintenant ».
- **un seul hôte global** monté dans `app/layout.tsx` à côté de `<CookieBanner />`, alimenté par un
  petit seam publish/subscribe au niveau module dans `lib/` (pas de nouveau contexte React).
  Plusieurs échecs simultanés sur plusieurs surfaces **fusionnent en un seul toast** — jamais une pile.
- Copie française, ton encre, non alarmant : « Connexion instable — nouvelle tentative… ». Le toast
  n'apparaît qu'**après l'échec de la première nouvelle tentative** (un simple hoquet reste invisible)
  et disparaît dès qu'une requête en attente aboutit.
- **L'accessibilité est la raison pour laquelle le toast n'est pas négociable** : un squelette qui ne
  se résout jamais n'annonce rien. `role="status"` + `aria-live="polite"` porte l'information au
  lecteur d'écran, et les conteneurs de squelette gardent leurs `role="status"` /
  `aria-label="Chargement…"` actuels.

### Le hook partagé

- Nouveau `apps/web/lib/useFetchState.ts` — `useFetchState(fetcher, deps)` → `{ state, data, error, retry }`.
  `state` **reste `'loading'`** pendant toute la boucle de tentatives transitoires et ne passe à
  `'error'` que sur un échec terminal.
- Les composants **gardent leur squelette et leur bloc d'erreur existants** : ils remplacent seulement
  leur effet local par le hook. Le rendu ne bouge pas, la machine à états oui.
- `useHomeSection` (`AccueilClient.tsx:21-38`) est déjà exactement ce hook, en privé : il devient le
  premier appelant supprimé au profit du hook partagé.
- Migration, surfaces œuvre d'abord : catalogue (`DecouvrirClient`/`CatalogGrid`), galerie
  (`GalerieClient`, `GalleryGrid`, `CollectionCardsGrid`, `QuickPreview`), rails d'accueil
  (`AccueilClient`), ma liste (`MaListeClient`), classement (`ClassementClient`), œuvre
  (`OeuvreClient`, `ChapterList`), profil (`ProfilePageClient`, `ProfileWorks`, `PortfolioGrid`),
  illustration (`IllustrationClient`). Puis le reste : notifications, candidatures reçues/envoyées,
  projets, appels, trouver + suggestions, contacts, comptes bloqués, éditeur, salon.

### Défauts corrigés au passage (tous visibles aujourd'hui)

- `PortfolioGrid.tsx:42` anime `pulse`, or `@keyframes pulse` n'est défini que dans un `<style>` inline
  de `NotificationsInbox.tsx:55` — sur une page profil ce composant n'est pas monté, **le squelette ne
  s'anime pas**. Utiliser `.ep-skeleton-delayed` (`globals.css:409-416`) comme partout ailleurs.
- `PortfolioGrid.tsx:50` et `ProfilePageClient.tsx:272` affichent une erreur **sans** aucun moyen de
  réessayer, contrairement à toutes leurs sœurs.
- `QuickPreview.tsx:107` et `ChapterList.tsx:90` affichent encore un « Chargement… » textuel nu au lieu
  d'un squelette.
- `DecouvrirClient.tsx:24-28` et `GalerieClient.tsx:127-130` avalent l'échec des tendances en rail vide
  (`.catch(() => setTrending([]))`) — un rail vide est indistinguable de « aucune tendance ».
- `ProfileWorks.tsx:62`, `OeuvreClient.tsx:101`, `IllustrationClient.tsx:91` rendent
  `error?.message ?? '…'`, ce qui peut faire fuiter le « Failed to fetch » anglais du navigateur dans un
  `role="alert"` — précisément ce que `apiErrorMessage()` a été écrit pour empêcher. Les y faire passer.

### Responsive & accessibilité

- Le toast doit rester lisible et cliquable à ~375 px : ne pas recouvrir la nav mobile, pas de
  débordement horizontal (`maxWidth: 'calc(100vw - 32px)'` est déjà en place), cible tactile ≥ 44 px
  pour l'action.
- Aucune régression sur les trois points de rupture (375 / 768 / 1280) des écrans migrés.

## Backend

Aucun. Story purement frontend : aucun endpoint, aucune entité, aucune migration.

## Dependencies

- [[DR-2]] / [[DR-3]] / [[DR-5]] / [[DR-7]] / [[DR-8]] — leurs puces « States » (squelette de
  chargement, état d'erreur) sont **précisées** par cette story, pas dupliquées : l'état d'erreur n'y
  vaut plus que pour un échec terminal.
- [[DR-3]] — la vue 404 « œuvre introuvable » est exactement le chemin terminal qui ne doit pas régresser.
- [[DR-10]] — le 403 de la barrière 18+ est terminal, jamais réessayé.
- [[F-1]] — le 401 renvoie vers la connexion, il n'est pas réessayé.
- [[F-9]] — l'`x-request-id` déjà capté par `lib/api.ts:52` reste utile pour corréler les échecs répétés.
- [[F-21]] — le rapport de bug embarque ce même identifiant de corrélation.

## Notes

- « Ponytail » : pas de SWR ni de react-query. Le hook fait ~40 lignes au-dessus du `lib/api.ts`
  existant, et la pause/reprise s'appuie sur `navigator.onLine` + `visibilitychange`, pas sur une
  librairie. Marquer d'un commentaire `ponytail:` le plafond assumé : les tentatives sont **illimitées**
  et le toast est **unique** (pas de pile, pas de file par surface) ; si un jour plusieurs échecs
  distincts doivent être distingués, c'est là qu'on ajoutera une file.
- Le bouton « Réessayer » des blocs rouges existants **ne disparaît pas** : il reste sur le chemin
  terminal où il a encore un sens (un 500 devenu permanent est transitoire par nature et n'y arrive
  jamais).
- Verification :
  - Test unitaire de `useFetchState` avec minuteurs simulés — un 500 suivi d'un succès ne fait
    **jamais** apparaître `'error'` ; un 404 passe à `'error'` dès la première tentative avec **zéro**
    nouvelle tentative ; les délais de backoff correspondent ; la boucle s'arrête à l'unmount et hors
    ligne.
  - Playwright : intercepter `**/works*` avec `route.abort()`, vérifier que le catalogue garde son
    squelette `role="status"`, que le toast apparaît et qu'**aucun** `role="alert"` n'est rendu ; puis
    laisser passer la requête et vérifier que la grille s'affiche et que le toast disparaît.
  - Playwright : intercepter le détail d'une œuvre avec un `404` et vérifier que la vue « introuvable »
    s'affiche immédiatement — le chemin terminal ne doit pas régresser.
  - Les trois points de rupture (375 / 768 / 1280) pour le toast.
