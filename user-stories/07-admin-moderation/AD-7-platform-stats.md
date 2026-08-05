# AD-7 — Platform stats

**As an** Admin, **I want** a dashboard of platform-wide metrics, **so that** I can monitor the health and growth of the platform at a glance.

> Screen(s): admin stats view (prototype tab `data-adminview=stats`, not drawn) · Priority: Could · Fidelity: Inferred

## Frontend
- Stats view within the admin console showing headline metrics (conservative set): total users, total works, total reads, active contests, and reports volume (e.g. open vs resolved).
- Presented as metric cards / simple counts; optional time-range selector (inferred).
- States:
  - Loading: skeleton cards while metrics load.
  - Empty: zero values render plainly (no special empty screen).
  - Error: toast / inline error if metrics fail to load.
- Accessibility: each metric exposes a label + value pair readable in order; cards are not color-only.

## Backend
- **GET /admin/stats** — returns platform-wide aggregates: `{ users, works, reads, contestsActive, reports: { open, resolved } }`.
- Read-only aggregation over existing entities (users, works, read events, contests, reports); no new write paths.

### Précisé le 2026-08-05 — la moitié est déjà en base, sans table nouvelle

Toutes les tables métier portent un `createdAt`, donc ces chiffres se calculent **sans** [[F-23]] :
publications par jour et par type · top œuvres (`readCount`, `likeCount`) · top genres · **taux
d'interaction** `(likes + favoris + avis + commentaires) ÷ readCount` par œuvre · croissance des comptes.

**« Quelle part des inscrits publie » se répond en TROIS chiffres, pas un** (décision 2026-08-05) — le
pourcentage unique cache l'entonnoir. Sur `count(Account where deletedAt is null)` :
1. **contributeurs** — au moins un commentaire ou un avis ;
2. **créateurs** — au moins une œuvre, un chapitre ou une illustration publiés ;
3. **auteurs publiés** — crédité sur une œuvre effectivement publiée (`WorkCreator` → `Work.publishedAt`).

Ce qui **exige** [[F-23]] et ne peut pas être dérivé : visiteurs, lectures dans le temps, et le rapport
visiteurs → inscriptions. Une fois [[F-23]] livré, la réponse porte en plus `series: DailyStat[]` sur 30 jours.

**Mise en cache :** utiliser le helper `cached()` fail-open — aujourd'hui **dupliqué trois fois**
(`HomeService`, `RankingService`, `CatalogService`). Le remonter sur `RedisService` et migrer les copies est
un suivi à net négatif de lignes.

**Ordre de livraison :** l'endpoint peut sortir **avant** [[AD-1]]. La page `apps/web/app/admin/page.tsx`
est un stub de 33 lignes ; livrer l'API et la lire au curl plutôt que bricoler une coque d'admin pour un
seul écran.
- Business rules: counts reflect current totals; figures are platform-wide, not per-user.
- Authorization: `admin` ([[F-2]]).
- Side effects: none.

## Dependencies
- [[AD-1]] — host console (pour l'écran ; **pas** pour l'endpoint).
- [[F-2]] — authorization.
- [[F-23]] — visiteurs, lectures dans le temps et conversion ; le reste est dérivable sans lui.
- [[DR-13]] — livre la file `analytics` et le cron nocturne.

## Notes
- Inferred: entire story exists only as prototype tab CSS (`data-adminview=stats`) with no rendered frame; metric set kept deliberately conservative and may expand once designed.
