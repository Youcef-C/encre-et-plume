---
description: Implement one Encre & Plume user story end-to-end through the four-stage pipeline — Manager → Full-Stack Dev → QA → Reviewer, with Manager/Reviewer inline and Dev/QA dispatched — looping back to the Manager on a failed review until it passes (max 3 rounds).
argument-hint: <story-id | epic-folder>   e.g. F-1  or  00-foundation
disable-model-invocation: true
---

You run the Encre & Plume dev pipeline — Manager → Full-Stack Dev → QA → Reviewer. Target: `$1`.

**Manager and Reviewer run inline in this main thread**: read that role's instructions in
`.claude/agents/<role>.md`, follow them as your own instructions, and write the stage's artifact to disk
before moving on. Both mostly read artifacts you already hold, and both want the strongest model — planning
sets the global view, reviewing is the gate — so a subagent would only pay to re-read what you have.

**The Full-Stack Dev and QA are dispatched as subagents.** The Dev is the context you don't want to keep:
it reads the prototype and rewrites app files over many turns, and none of that has to live in this thread
afterwards — `backend-notes.md` + `frontend-notes.md` are all the later stages need. QA is dispatched
because it runs on a cheaper model (`model: sonnet`) and its work — running suites, grading criteria
against the plan — doesn't need this thread's context, just the files.

Wear one hat at a time. Each inline stage works from the artifacts on disk — the plan, the QA report — not
from your memory; that's what keeps the Reviewer honest. Review as the Reviewer would and let a real blocker
FAIL even though you planned it.

## 0 · Resolve & init
- If `$1` is an epic folder (e.g. `00-foundation`), list its `*.md` stories (skip `_epic.md`), order by
  dependency, and run the full pipeline below for each story in turn. Otherwise treat `$1` as a story ID.
- Find the story file: `user-stories/**/$1-*.md`. Read it, its `[[dependencies]]`, and the epic `_epic.md`.
  The story's **epic folder** is the parent directory of that file (e.g. `01-discovery-reading`) — call it `<epic>`.
- Pipeline artifacts are grouped by epic for readability: the pipeline dir for this story is
  **`.claude/pipeline/<epic>/$1/`** (create it) and write `state.json` = `{ "story": "$1", "iteration": 1, "verdict": null }`
  there. Everywhere below, `.claude/pipeline/$1/` means `.claude/pipeline/<epic>/$1/`.
- If `apps/` does not exist, the repo is greenfield — tell the Manager (step 1) to scaffold the monorepo
  (per `CLAUDE.md`) before planning.

## 1 · Manager  (loop entry — re-enters here on a failed review)
Follow `.claude/agents/project-manager.md` against the story file. On `iteration > 1`, first read
`review.md` and `qa-report.md`, **keep the existing `plan.md`** — its §1 constraints and §3 deviations are
what stop the next round re-litigating settled decisions — and **append** a "Changes this round" section.
Write `plan.md`.

**Plan pre-flight — ONE table in `plan.md` §0, cleared before dispatching the Dev.** A blocking FAIL
re-runs Manager + Dev + QA + Reviewer, so a round costs far more than getting the plan right. These six
rows are what actually fail the gate. Each is **one line**: `OK` plus a pointer (task ID, file, banner +
line range) or `N/A — <reason>`. Silence is not an answer; a row that wants a paragraph belongs in the
task list, not here.

| Row | Cleared when |
|---|---|
| **DELETE exists** | every user-creatable resource has Create/Read/Update/**Delete** — route + server-side authz ([[F-2]]) + FE affordance (Delete gets a confirmation step) + a test. Delete is the one that gets dropped. |
| **Prototype named** | banner + line range for every screen touched; each induced deviation is a row in §3 with its reason, so QA and the Reviewer grade the deviation. |
| **Design system** | one shared `.ep-btn-*` intent class (destructive → `danger`), never inline colors; no emojis, no literal `✓`/`✕` — icons from `components/icons.tsx`; no bare native checkbox/select — `OnBrand*`; genre/tag via the shared vocabulary; page wrappers paint no `background`. |
| **Breakpoints** | ~375 / ~768 / ~1280 named in the frontend tasks, not assumed. |
| **Data safety** | every list endpoint paginated + indexed, no N+1; user-authored HTML reaching an `innerHTML` sink is sanitized server-side. |
| **Checklist** | every story criterion has an ID, a task, and the test that proves it. |

## 2 · Full-Stack Dev  (dispatched)
Dispatch the **fullstack-developer** agent. Pass the story path + `.claude/pipeline/$1/plan.md` — paths
only, it reads from disk. It builds the backend slice first, then the frontend against those real
contracts, and writes BOTH notes files. Wait for `backend-notes.md` **and** `frontend-notes.md`.

## 4 · QA  (dispatched)
Dispatch the **qa-test** agent. Pass the story path + `plan.md` + the two notes files — paths only. Wait
for `qa-report.md`, then read it; that report (not the agent's chat summary) is what the Reviewer grades.

## 5 · Reviewer  (the gate)
Follow `.claude/agents/reviewer.md` against the story + `plan.md` + `qa-report.md` + the diff. Write
`review.md` and the `verdict` in `state.json`.

## 6 · Gate
- **VERDICT: PASS** → the story is done. **≤8 lines to the user:** what was built (endpoints · models ·
  screens), the run/migrate command, the QA result, and the non-blocking follow-ups from `review.md`, one
  line each. If iterating an epic, move to the next story. Stop the loop for this story.
- **VERDICT: FAIL and iteration < 3** → increment `iteration` in `state.json`, briefly relay the blocking
  findings to the user, and **go back to step 1 (Manager)** — the Manager folds the feedback in and the
  devs/QA/Reviewer run again.
- **VERDICT: FAIL and iteration == 3** → STOP. Do not loop further. Report to the user the outstanding
  blocking findings and the artifact paths (`.claude/pipeline/$1/`) so they can decide. Never loop indefinitely.

## Rules
- Run the stages **one at a time, in order** (Manager + Reviewer inline, Dev + QA dispatched). Backend goes
  before frontend so the UI binds to real contracts. All failures route back through the Manager stage,
  never stage-to-stage.
- Dispatched agents get **file paths, not pasted contents** — they read from disk.
- **CRUD completeness:** when a story introduces a resource users can create/edit, the plan AND the
  implementation must cover its whole lifecycle — Create, Read/list, Update, **and Delete** — each with its
  route + authz ([[F-2]]), FE affordance (Delete needs a confirmation step), and a test, unless the story
  explicitly excludes one. **DELETE is the operation most often dropped** — confirm it's present (or
  scoped-out on purpose) before the gate, not after.
- Keep context workable: read what a stage actually needs, not everything; the artifacts on disk are the
  memory, so you can stay narrow and re-read a file when you need it again.
- **Never read the prototype HTML whole** — it's one enormous file. `grep -n '<!-- =\{4,\}'` for the banner
  line numbers, then `Read` only your section's range (`offset`/`limit`). Applies to every stage.
- Between stages, sanity-check the expected artifact was actually written before proceeding.
- Announce each stage as you go (e.g. "Round 1 · Backend…"), and when it finishes **relay that stage's
  recap verbatim — ≤5 lines, the format in that agent's file.** The recap is the user's deliverable; the
  artifacts are for the next stage, not for them. Never paste an artifact into the chat.
- **Artifact budgets** (hard; repeated in each agent's file): `plan.md` ≤180 · `backend-notes.md` ≤90 ·
  `frontend-notes.md` ≤100 · `qa-report.md` ≤60 · `review.md` ≤40 lines. **Failure detail is exempt** — a
  FAIL/BLOCKED item or a blocking finding gets all the room it needs, and a retry round appends its own
  section rather than rewriting. An artifact over budget isn't thorough, it's padded.
