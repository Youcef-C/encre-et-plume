# Encre & Plume

A French manga-creator collaboration platform that grows the French manga market by connecting the whole
chain: **Find a partner → Create together → Publish & be read → Get scouted by a publisher.** User types:
Reader (lecteur·rice), Writer (scénariste), Illustrator (dessinateur·rice), Publisher/Editor (verified
`editor`), Editorial staff (`maintainer`), Admin.

## Tech stack
- **Web:** Next.js (App Router, React/TypeScript) + Tailwind CSS — `apps/web`.
- **API:** NestJS (REST + WebSocket gateway) — `apps/api`.
- **DB:** PostgreSQL via Prisma. **Cache / sessions / pub-sub:** Redis (via `ioredis`) — back rate-limiting, token/session denylists, feed & match caches, and WS fan-out here. **Payments:** Stripe.
- **Local infra:** `docker-compose.yml` at the root runs Postgres + Redis for dev/CI; connection via `DATABASE_URL` / `REDIS_URL`.
- **Tests:** Jest (API), Vitest + React Testing Library (web units), Playwright (e2e).
- **Monorepo:** pnpm workspaces + Turborepo; shared TS contracts in `packages/shared`.

## Scaling & reliability (target: tens of thousands of users — see `ARCHITECTURE.md`)
- **Modular monolith, NOT microservices.** Keep clean module boundaries per domain; scale by running N
  stateless instances behind a load balancer. Don't split services preemptively — only if a measured
  bottleneck forces it.
- **Stateless app servers.** No in-process session/state (JWT in cookie; sessions/denylist/rate-limit/cache
  in Redis). The **WebSocket gateway MUST use the Redis adapter** so realtime fans out across instances.
- **Background queue (`F-8`, BullMQ on Redis):** slow / bursty / money work runs OFF the request path —
  email, notification fan-out, image processing, **Stripe webhooks**, **payouts**. A worker is a second
  entrypoint into THIS monolith (shared modules), not a service. Provide a `QueueService.enqueue()` seam.
- **Payments are queue + DB-transaction + idempotent** (`MR-*`): the webhook verifies the signature,
  persists the raw event (dedup on Stripe `event.id`), returns 200 fast, then enqueues; the worker does the
  money write inside an **ACID Postgres transaction** with an idempotency key; a reconciliation job catches
  drift. The queue does NOT replace the DB transaction — both are required.
- **Database:** index + **paginate every list**, avoid N+1, use a connection pooler (PgBouncer); read
  replicas only later if reads dominate.
- **Media/images (`F-10`):** bytes live in S3-compatible object storage (never Postgres / the app server);
  uploads go **direct-to-storage via presigned URLs** (the API never proxies bytes), derivatives via the
  `image-processing` queue, delivery via **CDN** (public URLs) or short-lived **signed URLs** (private:
  premium chapters, private attachments). Allowlist content types, cap size/dimensions, strip EXIF. Keep
  plain `<img>` + CDN `srcset` (no `next/image`).
- **Observability is required (`F-9`):** Sentry error tracking, structured logs with a request/correlation
  id, `/health` + readiness, metrics (RED + queue depth + DB pool), and actionable alerts. Never log
  secrets/PII (RGPD).

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
90 stories across 8 epics, indexed by `user-stories/README.md`. Each story is `As a … I want … so that …`
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
- **No emojis in the UI** (user rule — overrides any emoji/dingbat the prototype draws). Every pictogram
  comes from the shared SVG icon set `apps/web/components/icons.tsx` (chunky ink-style strokes); extend
  that file when a new icon is needed. Pure typography (arrows `→`, `✓`, `＋`, `◆` separators) is fine.
- **On-brand form controls** (user rule): never render bare native checkboxes/selects — use the shared
  `apps/web/components/form/OnBrandCheckbox.tsx` / `OnBrandSelect.tsx`. Genre/tag entry is never free
  text: use `GenreChip` + `GenreSuggestInput` backed by the `packages/shared/src/genres.json` vocabulary
  (`F-20`). Filter UIs auto-apply on change (no "Appliquer" button) with debounced text inputs.
- **Prototype REPLICA (not approximation)** — the UI must be a faithful **replica** of the interactive
  prototype, the single source of truth: **`Manga creator collaboration platform/Encre et Plume - Prototype.dc.html`**.
  Do NOT invent layouts, nav items, controls, icons, or copy — reproduce what the prototype draws.
  - **Finding the right section:** the prototype is one HTML file where every screen is delimited by a
    banner comment `<!-- ============ NAME ============ -->` and carries `data-screen="<key>"` /
    `data-page="<key>"`; sub-components inside a screen use inner `<!-- comment -->` markers, and the global
    header is the **`<!-- ============ TOP NAV ============ -->`** section. To build/verify a screen: grep the
    file for its banner (e.g. `PROFIL`, `GALERIE`, `ŒUVRE`, `CLASSEMENT`, `MESSAGES`) or its `data-screen`
    key, read that whole section, and replicate it: same structure/DOM order, same components, the exact
    inline-style values (padding, borders `3px solid var(--ink)`, `border-radius`, hard offset shadows like
    `5px 5px 0 var(--shadow)`, halftone dot avatars `radial-gradient(var(--ink) 1.4px,transparent 1.5px)`),
    the same tokens, the same icons/glyphs, and **verbatim French copy**. Hover states come from the
    prototype's `style-hover="…"` attributes (e.g. nav links fill `background:var(--accent);color:#fff`).
  - Keep the real wiring (auth, routes, session, live data) but the **markup + styling must match the
    prototype section**. Translate the prototype's `{{ handlers }}` to real behavior; don't change its look.
  - `Explicit` screens must be a visual replica of their section. `Inferred` screens (no drawn frame) still
    use the same tokens/components and the nearest analogous prototype patterns. Lean on `frontend-design`.
- **Responsive** — every screen must work on mobile, tablet, and desktop. The prototype defines the
  **desktop** replica; you must also adapt it down gracefully (the prototype itself is desktop-only — don't
  expect mobile markup in it). Targets ~**375px** (mobile), ~**768px** (tablet), ~**1280px+** (desktop):
  no horizontal overflow, fluid/wrapping layouts, multi-column grids reflow to fewer columns, the primary
  nav collapses into a menu/hamburger on narrow widths, tap targets ≥ ~44px, modals/overlays usable on
  mobile. Build mobile-first with CSS (media queries / clamp / flex-wrap / grid auto-fit) — don't ship a
  desktop-only fixed-width layout. QA and the reviewer test all three breakpoints.
- **Handoff discipline** — each agent reads its inputs from `.claude/pipeline/<ID>/` and writes its named
  artifact there; don't skip the artifact.
