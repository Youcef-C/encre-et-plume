# DR-10 — Age verification & 18+ content gating

**As a** platform operator, **I want** users to declare their birthdate and 18+ works to be gated behind an age check, **so that** minors are not served adult content and the platform limits its legal exposure.

> Screen(s): none drawn (signup field + interstitial over drawn DR surfaces) · Priority: Should · Fidelity: Inferred

## Frontend
- Signup ([[F-1]]) gains a required **"Date de naissance"** field (French format, accessible date input); inline validation ("Date invalide", minimum age if product sets one).
- **18+ interstitial**: opening an 18+ work ([[DR-3]]), its reader ([[DR-4]]), or an 18+ illustration ([[DR-6]]) shows a blocking confirmation "Contenu réservé aux adultes (18+)" with "J'ai 18 ans ou plus — continuer" / "Retour":
  - Logged-in adult (birthdate ⇒ ≥ 18): confirmation shown once, choice remembered ("Ne plus me demander").
  - Logged-in minor: access refused — "Ce contenu est réservé aux adultes." (no bypass).
  - Visitor (no account): confirmation interstitial each session (self-declaration), plus a sign-in prompt.
- **Listing treatment**: 18+ covers/thumbnails are blurred with an "18+" badge in catalog/gallery/ranking/home rails ([[DR-1]], [[DR-2]], [[DR-5]], [[DR-7]]) until the viewer is age-cleared; the existing "PUBLIC" filter chips ([[DR-2]]) keep working.
- States: interstitial confirm/refused; remembered choice; blurred/unblurred listings.
- Accessibility: interstitial is a focus-trapped dialog with explicit title; blurred items name their rating ("Œuvre 18+") for screen readers; date input labelled.
- Responsive: interstitial and badges usable at 375/768/1280 px.

## Backend
- `Account.birthdate?` (date; required at signup from this story on; existing accounts prompted on next 18+ access).
- Age check derives from `birthdate` server-side — never trust a client "I am 18" claim for logged-in users.
- **Enforcement on every content endpoint**, not just UI: work/chapter/illustration reads ([[DR-3]], [[DR-4]], [[DR-6]]) where `audienceRating = "18+"` return 403 with a typed error for logged-in minors; list endpoints include `audienceRating` so clients can blur; visitor access follows the self-declaration rule (session flag) as the conservative default.
- Business rules: rating vocabulary stays [[DR-2]]'s `Work.audienceRating` ("Tous publics", "12+", "16+", "18+"); only the "18+" tier hard-gates; 12+/16+ remain informational badges. Creators set the rating at publish ([[PUB-1]]/[[CS-1]]); misrated content is a moderation matter ([[AD-4]]).
- Validation: birthdate plausible (not future, not > 120 y); rating from the allowed enum.
- Authorization: gating enforced server-side ([[F-2]]); staff/moderation surfaces ([[AD-4]]) are exempt from the gate.
- Side effects: none beyond the session "age-cleared" flag; no per-view logging of adult-content access (privacy).
- Shared contracts in `packages/shared/src/catalog.ts` (extend rating types) — reuse, don't duplicate.

## Dependencies
- [[F-1]] — signup hosts the birthdate field.
- [[DR-2]] — the `audienceRating` vocabulary and PUBLIC filter this story enforces.
- [[DR-3]] / [[DR-4]] / [[DR-6]] — the gated surfaces.
- [[PUB-1]] — rating set at publish time.

## Notes
- Inferred: no prototype frame — the interstitial reuses the drawn modal patterns; blur + badge styling from manga-zine tokens.
- Compliance floor: self-declaration + declared-birthdate enforcement is the conservative baseline; stronger age **verification** (document checks) is an explicit product/legal decision left open.
- RGPD: birthdate is personal data — include it in the [[F-14]] export; never expose it publicly.
