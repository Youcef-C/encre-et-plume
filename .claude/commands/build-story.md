---
description: Implement one Encre & Plume user story end-to-end through the multi-agent pipeline — Manager → Full-Stack Dev → QA → Reviewer — looping back to the Manager on a failed review until it passes (max 3 rounds).
argument-hint: <story-id | epic-folder>   e.g. F-1  or  00-foundation
disable-model-invocation: true
---

You are the **orchestrator** for the Encre & Plume dev pipeline. Run this loop yourself in the main
thread (you hold the loop state; the agents start fresh and hand off through files on disk). Target: `$1`.

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
Dispatch the **project-manager** agent. Pass: the story file path, the pipeline dir
`.claude/pipeline/$1/`, and — **only when `iteration > 1`** — point it at `review.md` and `qa-report.md`
so it revises the plan and adds a "Changes this round" section. Wait until `plan.md` exists.

## 2 · Full-Stack Dev
Dispatch the **fullstack-developer** agent. Pass the story path + `.claude/pipeline/$1/plan.md`. It builds
the backend slice first, then the frontend against those real contracts, and writes BOTH notes files. Wait
for `backend-notes.md` **and** `frontend-notes.md` (both must exist before QA).

## 4 · QA
Dispatch the **qa-test** agent. Pass the story path + `plan.md` + the two notes files. Wait for `qa-report.md`.

## 5 · Reviewer  (the gate)
Dispatch the **reviewer** agent. Pass the story path + `plan.md` + `qa-report.md`. Read its `review.md`
and the `verdict` in `state.json`.

## 6 · Gate
- **VERDICT: PASS** → the story is done. Summarize to the user: what was built (key files/endpoints/
  components), how to run it, the QA result, and any non-blocking follow-ups from `review.md`. If iterating
  an epic, move to the next story. Stop the loop for this story.
- **VERDICT: FAIL and iteration < 3** → increment `iteration` in `state.json`, briefly relay the blocking
  findings to the user, and **go back to step 1 (Manager)** — the Manager folds the feedback in and the
  devs/QA/Reviewer run again.
- **VERDICT: FAIL and iteration == 3** → STOP. Do not loop further. Report to the user the outstanding
  blocking findings and the artifact paths (`.claude/pipeline/$1/`) so they can decide. Never loop indefinitely.

## Rules
- Dispatch agents **one at a time, in order**. The Full-Stack Dev builds backend-before-frontend internally
  so the UI binds to real contracts. All failures route back through the Manager — agents never call each
  other directly.
- **CRUD completeness:** when a story introduces a resource users can create/edit, the plan AND the
  implementation must cover its whole lifecycle — Create, Read/list, Update, **and Delete** — each with its
  route + authz ([[F-2]]), FE affordance (Delete needs a confirmation step), and a test, unless the story
  explicitly excludes one. **DELETE is the operation most often dropped** — confirm it's present (or
  scoped-out on purpose) before the gate, not after.
- Keep your own context small: pass agents **file paths**, not pasted file contents; they read from disk.
- Between stages, sanity-check the expected artifact was actually written before proceeding; if an agent
  failed to produce its file, report it rather than continuing blindly.
- Announce each stage to the user as you go (e.g. "Round 1 · Backend…") so the run is followable.
