# Encre & Plume

A French manga-creator collaboration platform that grows the French manga market by connecting the whole
chain: **Find a partner → Create together → Publish & be read → Get scouted by a publisher.** User types:
Reader (lecteur·rice), Writer (scénariste), Illustrator (dessinateur·rice), Publisher/Editor (verified
`editor`), Editorial staff (`maintainer`), Admin.

## Tech stack
- **Web:** Next.js (App Router, React/TypeScript) + Tailwind CSS — `apps/web`.
- **API:** NestJS (REST + WebSocket gateway) — `apps/api`.
- **DB:** PostgreSQL via Prisma. **Payments:** Stripe.
- **Tests:** Jest (API), Vitest + React Testing Library (web units), Playwright (e2e).
- **Monorepo:** pnpm workspaces + Turborepo; shared TS contracts in `packages/shared`.

## Repo layout
```
apps/web/        # Next.js frontend
apps/api/        # NestJS backend (REST + WS, Prisma)
packages/shared/ # shared types / API contracts (FE and BE agree here)
user-stories/    # the product backlog — the spec the pipeline implements
.claude/         # agents, the /build-story command, pipeline scratch, settings
```
The monorepo **root config is already provided** (`package.json`, `pnpm-workspace.yaml`, `turbo.json`,
`tsconfig.base.json`, `.nvmrc` = Node 24, `.gitignore`, `.github/` CI/CD). The pipeline's Manager adds
`apps/` and `packages/` into this existing skeleton on the first `/build-story` run — it must not clobber
the root config. Use the latest stack majors (Next.js 15, NestJS 11, Prisma 6) on Node 24.

## The backlog (`user-stories/`)
65 stories across 8 epics, indexed by `user-stories/README.md`. Each story is `As a … I want … so that …`
with separate **Frontend** and **Backend** acceptance criteria, **Dependencies** as `[[ID]]` cross-refs,
and a **Fidelity** flag (`Explicit` = drawn in the design; `Inferred` = intended but not fully drawn —
treat its criteria conservatively and confirm open questions). IDs: `F-` foundation, `DR-` discovery &
reading, `MC-` matching & collaboration, `CS-` creation studio, `PUB-` publishing & engagement, `PE-`
publisher space, `MR-` monetization, `AD-` admin.

## Building features — the agent pipeline
Run **`/build-story <ID>`** (e.g. `/build-story F-1`) to implement a story end-to-end. The main session
orchestrates five role-specialized subagents (in `.claude/agents/`):

`project-manager → backend-developer → frontend-developer → qa-test → reviewer`

The **reviewer** is the quality gate. On a blocking FAIL the pipeline loops back to the **project-manager**
with the feedback and runs again — **max 3 rounds**, then it stops and reports. Agents hand off through
files in `.claude/pipeline/<ID>/` (`plan.md`, `backend-notes.md`, `frontend-notes.md`, `qa-report.md`,
`review.md`, `state.json`). Pass an epic folder (e.g. `00-foundation`) to fan out story-by-story.

## Conventions
- **TDD** — write the failing test before the implementation (API + web).
- **Ponytail laziness** — the simplest solution that works: reuse existing code, prefer the platform/
  stdlib, no speculative abstractions. Smallest correct diff wins.
- **Language** — UI copy stays in **French** (verbatim from the stories, e.g. "Lire maintenant",
  "Trouver un·e partenaire"); code, identifiers, comments, and commits are in **English**.
- **Authz** — role gating per story `F-2` (utilisateur / editor[verified] / maintainer / admin); enforce
  server-side, never trust client role claims. Editor access requires the admin-set verified flag (`AD-3`).
- **Design system** — manga-zine identity: Anton (display) + Zen Kaku Gothic New (body), ink `#16130f` /
  paper `#f1ece1` / accent red `#e8261c`, halftone textures, bold borders, hard offset shadows. Reuse
  tokens/components in `apps/web`; don't reinvent them. Accessibility basics are required, not optional.
- **Handoff discipline** — each agent reads its inputs from `.claude/pipeline/<ID>/` and writes its named
  artifact there; don't skip the artifact.
