---
description: Run the /build-story pipeline successively across the whole Encre & Plume backlog, in dependency order — resumable, skipping already-passed stories and stories whose dependencies failed. Optionally scope to one epic folder.
argument-hint: [epic-folder]   e.g. (none) for all, or 00-foundation
disable-model-invocation: true
---

You are the **batch orchestrator**. You run the full `/build-story` pipeline for many stories in turn.
Do this in the main thread; keep your own context small (work from file paths, not pasted contents).

## 0 · Build the ordered story list
- Enumerate stories: `user-stories/**/<ID>-*.md` (exclude `_epic.md` and `README.md`).
- If `$1` is given (an epic folder, e.g. `00-foundation`), restrict to that folder.
- **Order by dependency:** sort by epic number (`00` → `07`) then by story number within the epic. This
  matches the dependency spine in `user-stories/README.md` (foundation first; works/profiles before the
  features that consume them). Before running a story, read its `[[dependencies]]`; if a dependency has
  not PASSED yet, defer the story until after its deps (re-order rather than fail it).
- Pipeline artifacts are grouped by epic: each story's dir is `.claude/pipeline/<epic>/<ID>/` (where
  `<epic>` is the story file's epic folder, e.g. `01-discovery-reading`). Cross-cutting scratch (the batch
  ledger, audit notes) stays at the top level of `.claude/pipeline/`.
- Maintain a batch ledger at `.claude/pipeline/_batch.json`:
  `{ "scope": "$1|all", "results": { "<ID>": "passed|failed|skipped" } }`.

## 1 · Resume
Skip any story already marked `passed` in `_batch.json`, or whose `.claude/pipeline/<epic>/<ID>/state.json` has
`verdict: "PASS"`. This makes re-running `/build-all` resume where it left off instead of redoing work.

## 2 · Per story — run the loop yourself
For each remaining story **in order**, run the `/build-story <ID>` loop
(`.claude/commands/build-story.md`) — Manager → Full-Stack Dev → QA → Reviewer, looping back to the Manager
on a blocking FAIL, capped at 3 rounds. Manager and Reviewer run inline in this thread; Dev and QA are
dispatched as subagents, which also keeps their (large) contexts out of this long batch. Announce each story
and each stage as you start it (e.g. "[3/65] DR-3 — Work page… · Round 1 · Backend").

Then record the outcome in `_batch.json`:
- **PASS** → `passed`. **Commit & push the completed feature** before moving on. FIRST, run the full CI
  command set yourself on Node 24 and confirm every one is green — **never push red**:
  `pnpm lint && pnpm typecheck && pnpm build && pnpm test` (these are exactly what CI runs; `pnpm test`
  passing is NOT enough — lint/typecheck/build have each broken CI on their own). Only when all pass: stage
  the story's work, commit on `develop` with `feat(<ID>): <story title>` (English, standard `Co-Authored-By`
  trailer), and `git push origin develop`. If any CI command is red, treat it like a reviewer blocker (fix
  it or loop back) rather than pushing. If the push itself fails (network/auth), report and keep going.
  Then continue to the next story. (Clear a stale `apps/web/.next` before `pnpm build` if it errors on
  `/_not-found` — that's a local cache artifact, not a code failure.)
- **FAIL after 3 rounds** → `failed`. Do **not** halt the whole batch. Mark every not-yet-built story
  that lists this story in its `[[dependencies]]` (directly or transitively) as `skipped` — they can't
  be built on a broken dependency — and continue with the rest. (Don't commit a failed story's WIP.)

## 2b · Epic-boundary pause
After the **last story of an epic folder** finishes (the next story belongs to a different `NN-…` folder,
or the list is exhausted), **pause**: give a short per-epic recap (passed / failed / skipped for that
folder, and that its commits are pushed) and **ask the user whether to continue to the next epic** before
starting it. Wait for their go-ahead. This keeps the long run in human-reviewable chunks. (If the user has
said to run straight through, skip the prompt.)

## 3 · Final report
When the list is exhausted, summarize to the user: counts of passed / failed / skipped, the list of
failed stories with a one-line reason + their `.claude/pipeline/<epic>/<ID>/review.md` path, and the skipped
stories with the failed dependency that blocked each. Remind them that re-running `/build-all` resumes
and will retry the failed/skipped ones (after they address the blockers).

## Rules
- One story at a time, in dependency order — never run stories concurrently (they share the codebase).
- Dev and QA are subagents; you execute Manager and Reviewer inline. Read the files a stage actually needs
  and keep the rest at path level — this context has to survive dozens of stories.
- This is a long, expensive run (dozens of stories × up to 3 rounds each). Surface progress continuously
  so it's followable and interruptible; the ledger makes any interruption resumable.
- Don't lower the bar to get through faster — each story still has to pass the Reviewer gate.
