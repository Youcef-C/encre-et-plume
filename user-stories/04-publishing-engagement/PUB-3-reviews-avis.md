# PUB-3 — Reviews "Avis"

**As a** Reader, **I want** to leave a structured review of a work with separate ratings for story and art, **so that** other readers can judge the work and the creator gets meaningful feedback.

> Screen(s): Work page ([[DR-3]]) and project "Infos" tab — "Avis des lecteur·rices" section · Priority: Should · Fidelity: Explicit

## Frontend
- "Avis des lecteur·rices" section showing:
  - Global aggregate "X/5".
  - Sub-scores: "Histoire" and "Dessin" averages.
  - Count: "N avis".
- "Laisser un avis" form:
  - Two star pickers: "Histoire" (story) and "Dessin" (art), 1–5 each.
  - Textarea for the written review.
  - Submit: "Publier mon avis".
- Review list, each item: author name, story stars + art stars, review text.
- If the viewer already reviewed: show their existing review with edit affordance instead of a fresh form (one review per user per work).
- Moderation per review ([[AD-5]]): hide / delete / restore (mirrors [[PUB-2]] controls) for owner/Admin.
- States:
  - Empty: "Aucun avis pour le moment" with the form shown.
  - Loading: aggregate + list skeleton; submit spinner on "Publier mon avis".
  - Error: toast on failure; form keeps entered ratings + text.
- Validation: both star ratings required (block submit until set); text optional or with a min if specified — block clearly if missing required ratings.
- Accessibility: star pickers operable by keyboard with labels ("Note Histoire", "Note Dessin") and announce selected value; aggregate exposed as text; "Publier mon avis" labelled.

## Backend
- **GET /works/{workId}/reviews** — list reviews + aggregates: `{ global, story, art, count, reviews[] }`.
- **POST /works/{workId}/reviews** — `{ storyRating, artRating, text }`. Response: created/updated review + recomputed aggregates.
- Moderation ([[AD-5]]): **PATCH /reviews/{id}** `{ action: "hide"|"delete"|"restore" }`.
- Entity **Review**: `id, workId, authorId, storyRating (1–5), artRating (1–5), text, status, createdAt, updatedAt`.
- Business rules:
  - One review per user per work — second submission updates the existing one (upsert).
  - Recompute global + per-dimension aggregates and count on every create/update/delete/hide.
  - `global` derived from story + art (e.g. mean of the two dimensions).
- Validation: `storyRating` and `artRating` required integers 1–5; reject out-of-range.
- Authorization: authenticated user to submit ([[F-1]]); cannot review own work (inferred guard); hide/delete/restore limited to owner/Admin ([[AD-5]]).
- Side effects: notify work owner of new review ([[F-5]]).

## Dependencies
- [[F-1]] — auth to submit.
- [[AD-5]] — review moderation.
- [[DR-3]] — work page hosts the section.
- [[F-5]] — new-review notifications.

## Notes
- Explicit: "Avis des lecteur·rices", global "X/5" with "Histoire"/"Dessin" sub-scores + "N avis", two star pickers + textarea + "Publier mon avis", list with name/story-art stars/text.
- Inferred: one-review-per-user upsert behavior, can't-review-own-work guard, global aggregation formula, edit affordance.
