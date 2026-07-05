# AD-9 — Contest administration & judging

**As** a `maintainer`, an **Admin**, the **owning `editor`**, or a **user appointed as a reviewer** for a contest, **I want** to run a contest end to end — manage the applicants, review their works with feedback, score entries on a rubric to build a ranking, optionally open it to public voting, and designate winners — **so that** contests are judged fairly and transparently.

> Screen(s): admin/editor "Concours" tab + contest judging view (prototype `concours` CSS; entry points drawn, judging INFERRED) · Priority: Should · Fidelity: Inferred

## Frontend
- **Contest list** (admin console [[AD-1]] / the editor's own contests): title, owner (editor org or « Plateforme »), status (en attente / actif / clôturé / résultats), entry count, dates; **"＋ Nouveau concours"** opens the [[PE-6]] editor (platform contest for staff; branded for the editor).
- **Contest actions**: "Approuver" (an editor-submitted `pending` contest → active), "Clôturer" (freeze entries → judging), "Publier les résultats".
- **Reviewers / jury management** (contest creator + admins): an **"Ajouter un·e juré·e"** control lets the creator appoint reviewers by searching users ([[F-7]]) — **any role** (editor, admin, maintainer, or a regular user) — and add/remove them from this contest's jury. Appointed reviewers gain judging rights **for this contest only** (not a global role). The owning editor + staff are reviewers by default; the list shows each juror and their scored-entry progress.
- **Judging view** (per contest, for reviewers):
  - **Applicants / entries list**: each row shows the applicant (avatar + name, **link to their profile** [[F-3]]), the submitted work/illustration preview, submission date, running jury score + public votes. **Add / remove** an entry (disqualify with a reason, or manually add an entry) — remove is confirmed and logged.
  - **Entry review panel**: open the submitted work in the reader/illustration viewer; a **feedback thread** where a reviewer posts **comments visible to the applicant** ([[PUB-7]] shows them on the applicant's side); reviewers can also leave internal-only notes.
  - **Scoring**: score the entry on the contest's **rubric criteria** — e.g. `Dessin`, `Histoire / Scénario`, `Personnages`, `Intrigue`, `Relations entre personnages`, `Originalité`, `Rythme`, `Univers`, `Respect du thème`, `Émotion / impact` (the criteria set is configured per contest in [[PE-6]], defaulted by content type; illustrations use `Dessin / technique`, `Composition`, `Couleur`, `Originalité`, `Respect du thème`). Each criterion uses a fixed scale (e.g. 0–10) on an on-brand control; the panel shows this reviewer's scores and the aggregate across the jury.
  - **Ranking**: a live leaderboard from the aggregated jury scores (and, when enabled, blended with the public vote — weighting shown); winners are **designated from the ranking** ("Marquer gagnant·e", up to the contest's `winnerCount`).
  - **Public voting toggle**: enable/disable public voting and see the public tally alongside the jury ranking.
- **States**: empty ("Aucun concours" / "Aucune participation" / "Aucun·e juré·e"); loading skeletons; spinner on score/comment/status save; error toast (state unchanged on failure).
- **Accessibility**: lists + judging controls labelled; each score input labelled with its criterion + entry; profile/work links named with context; leaderboard is an ordered list with rank labels; responsive 375/768/1280.

## Backend
- **Contest lifecycle**: `POST /admin/contests` (staff platform contest), `PATCH /admin/contests/{id}` `{ status: "approve"|"close"|"publish_results" }`, list/detail as before. Editors act on their own via the [[PE-6]] routes.
- **Reviewers**: `GET/POST/DELETE /contests/{id}/reviewers` — the contest creator (or admin) appoints/removes reviewers by `accountId` (any role); appointment grants **contest-scoped** judging rights only. Owning editor + staff are implicit reviewers.
- **Applicant / entry management**: `GET /contests/{id}/entries` (reviewer view — full applicant + work), `DELETE /contests/{id}/entries/{entryId}` (disqualify, with reason), `POST /contests/{id}/entries` (manual add by a reviewer).
- **Feedback comments**: `POST /contests/{id}/entries/{entryId}/comments` `{ body, visibleToApplicant }`, `GET …/comments` — applicant-visible comments surface to the participant ([[PUB-7]]); internal notes stay reviewer-only.
- **Scoring**: `PUT /contests/{id}/entries/{entryId}/scores` `{ scores: [{ criterion, value }] }` — upsert **this reviewer's** scores (one row per reviewer × entry × criterion); `GET …/scores` returns per-reviewer + aggregate.
- **Ranking**: `GET /contests/{id}/ranking` — entries ordered by the aggregate score (jury mean per criterion → total), optionally blended with the public vote per the contest's weighting; stable tiebreak.
- **Public voting** (config on the contest, [[PE-6]]): `POST /contests/{id}/entries/{entryId}/vote` (public, auth required, **one vote per account per entry**, rate-limited) — public UI in [[PUB-7]]; the tally feeds the ranking when enabled.
- **Entities**: **ContestReviewer** `{ id, contestId, accountId, addedById, createdAt }` (unique per contest×account); rubric on the contest (`Contest.judgingCriteria String[]`, `scoreScale`, `publicVotingEnabled`, `juryPublicWeight` — [[PE-6]]); **ContestEntryScore** `{ id, entryId, reviewerId, criterion, value }` (unique per reviewer×entry×criterion); **ContestEntryComment** `{ id, entryId, authorId, body, visibleToApplicant, createdAt }`; **ContestPublicVote** `{ id, entryId, accountId, createdAt }` (unique per account×entry); Entry gains derived `juryScore`, `publicVotes`, `rank`, `isWinner`, `disqualifiedReason?`.
- **Business rules**: only a `closed`/judging contest is scored (or during the live window per config); the ranking recomputes as scores/votes change; winners come from the ranking and cannot exceed `winnerCount`; disqualified entries drop out; publishing results notifies participants + surfaces winners in the feed ([[PUB-8]]).
- **Validation**: `criterion` must belong to the contest's rubric; `value` within `[0, scoreScale]`; a reviewer scores/comments only on contests where they are a reviewer; disqualify requires a reason; a public voter cannot vote on their own entry.
- **Authorization** ([[F-2]], server-side): **judge / score / comment / manage-entries = any appointed reviewer of that contest** (which always includes `maintainer`/`admin` and the owning `editor`, plus explicitly-added users of any role) — enforced per-contest via `ContestReviewer`, not by global role; appointing/removing reviewers = the contest creator or an admin; public vote = any authenticated user (except on their own entry); regular users never see internal notes or others' scores.
- **Audit** ([[AD-10]]): approve / close / publish-results / add-remove-reviewer / disqualify / winner-designation are logged.
- **Side effects**: approval/closure/results notify the editor + participants ([[F-5]]); appointing a reviewer notifies them; winners surface in the feed ([[PUB-8]]).

## Dependencies
- [[PE-6]] — contest creation + the judging rubric / public-voting config; the creator appoints reviewers.
- [[PUB-7]] — participants submit entries, see their applicant-visible feedback, and (public) browse + vote on entries.
- [[F-7]] — user search to appoint reviewers; [[F-3]] — reviewers consult applicant profiles; [[DR-4]]/[[DR-6]] — reviewing the submitted work/illustration.
- [[AD-1]] — host console; [[AD-10]] — action log; [[F-2]] — role gating; [[F-5]] — notifications; [[PUB-8]] — winner/feed surfacing.

## Notes
- Judging, an **appointable per-contest reviewer roster (any role)**, and public voting are the expanded scope (user-specified 2026-07-05); the prototype only draws the `concours` entry points, so the judging view is Inferred, built on the platform's on-brand components + the [[AD-2]] review pattern.
- Reviewer rights are **contest-scoped** (a `ContestReviewer` row), NOT a global role change — a regular user appointed to judge one contest gains no platform-wide privileges. This is the key authorization nuance for the reviewer.
- The rubric is **configurable per contest** (defaulted by content type), so illustration and manga contests are judged on relevant criteria; the listed criteria are sensible, extendable defaults.
