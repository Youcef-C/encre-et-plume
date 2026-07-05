# PUB-7 — Reader contest participation "Concours"

**As a** Reader or Creator, **I want** to discover an open contest and submit an entry before its deadline, **so that** I can participate in events like "Prix du jeune mangaka 2026".

> Screen(s): Home "ANNONCES" ribbon ([[DR-1]]), Découvrir news card ("Prix du jeune mangaka 2026 · clôture 30 j" with "Participer"); contest detail/participation screen INFERRED · Priority: Could · Fidelity: Explicit (entry points) / Inferred (participation screen)

## Frontend
- Entry points (explicit):
  - Home "ANNONCES" ribbon announcing contests.
  - Découvrir "Actualités" news card, e.g. "Prix du jeune mangaka 2026 · clôture 30 j" with a "Participer" button.
- **Contest entries / review page** (user-specified 2026-07-05 — a new page `/concours/{id}/participations`, or a tab on the contest page): the public browses all accepted entries with the work/illustration preview, the applicant's name (link to profile [[F-3]]), and entry stats.
  - **Public vote**: when the contest has public voting enabled ([[PE-6]]/[[AD-9]]), each entry has a vote control — **authenticated users** may cast **one vote per entry** (toggle, never on their own entry); the running public tally shows per entry.
  - After **results are published**, the page shows the final **ranking** (jury + public blend) with winners highlighted.
- **Applicant feedback view**: on my own entry, I can read the **reviewer comments marked visible to applicants** ([[AD-9]]) and — once results are out — my per-criterion scores and rank. Internal reviewer notes are never shown.
- Contest detail / participation screen (inferred — only entry points were drawn) expected to show:
  - Contest title, description, deadline countdown ("clôture 30 j"), and rules.
  - Entry count, e.g. "812 planches reçues".
  - "Participer" form: pick a submission asset — an existing work/illustration ("planche") to enter.
  - Submit: "Participer" / "Envoyer ma participation".
- States:
  - Open vs closed: "Participer" disabled with "Concours clôturé" past the deadline.
  - Loading while fetching contest; submit spinner.
  - Success confirmation; error toast on failure.
  - Visitor prompted to sign in ([[F-1]]).
- Validation: a submission asset must be selected; deadline must not have passed.
- Accessibility: "Participer" labelled with contest name; countdown exposed as text; asset picker keyboard-navigable.

## Backend
- **GET /contests?status={active|closed}** — list contests with `{ id, title, description, deadline, entryCount, status }`.
- **GET /contests/{id}** — contest detail + entry count ("812 planches reçues").
- **POST /contests/{id}/entries** — `{ submissionAssetId | workId }`. Response: created entry.
- **GET /contests/{id}/entries** — public browse of accepted entries (work preview + applicant public fields + public vote count); the reviewer/judging view is [[AD-9]].
- **POST /contests/{id}/entries/{entryId}/vote** / **DELETE …/vote** — public vote toggle: authenticated user, **one vote per account per entry** (unique), rate-limited, **rejected on the voter's own entry**; only while public voting is enabled + open.
- **GET /contests/{id}/entries/{entryId}/feedback** — the entry owner reads the reviewer comments flagged `visibleToApplicant` + (post-results) their scores/rank; owner-scoped, never exposes internal notes or other entries' scores.
- Entity **Contest**: `id, title, description, deadline, status, organizerId (publisher), entryCount, createdAt`.
- Entity **ContestEntry**: `id, contestId, participantId, submissionAssetId|workId, createdAt`.
- Business rules:
  - Enforce deadline server-side: reject entries after `deadline` (status → closed).
  - Increment `entryCount` on accepted entry.
  - Optionally one entry per participant per contest (inferred).
  - Public voting (when enabled): one vote per account per entry, not on your own entry; the tally feeds the [[AD-9]] ranking per the contest's jury/public weighting.
  - Reviewer feedback flagged visible-to-applicant is shown to the entry owner ([[AD-9]]).
  - Contests are created by publishers ([[PE-6]]) and administered ([[AD-9]]).
- Validation: contest active; submission belongs to the participant; required fields present.
- Authorization: authenticated user to enter ([[F-1]]); publisher to create ([[PE-6]]); admin to manage ([[AD-9]]).
- Side effects: notify participant of received entry ([[F-5]]).

## Dependencies
- [[F-1]] — auth to participate.
- [[PE-6]] — publishers create branded contests.
- [[AD-9]] — contest judging, feedback, scoring, ranking, and the public-vote config.
- [[DR-1]] — home announcement ribbon entry point.
- [[PUB-8]] — Découvrir "Actualités" card surfaces the contest.

## Notes
- Explicit-ish: "Participer" button + home "ANNONCES" ribbon + Découvrir card "Prix du jeune mangaka 2026 · clôture 30 j"; "812 planches reçues" count.
- Inferred: the contest detail/participation screen itself, the entry form, one-entry-per-user rule — only entry points were drawn.
