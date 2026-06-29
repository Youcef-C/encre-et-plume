# Encre & Plume

French manga-creator collaboration platform — **Find a partner → Create together → Publish & be read →
Get scouted by a publisher.** This repo is a pnpm + Turborepo monorepo.

> Product, conventions, and the multi-agent dev pipeline are documented in [`CLAUDE.md`](./CLAUDE.md).
> The full backlog lives in [`user-stories/`](./user-stories/).

## Stack
- **Web:** Next.js (App Router, React/TS) + Tailwind — `apps/web`
- **API:** NestJS (REST + WebSocket gateway) + Prisma — `apps/api`
- **DB:** PostgreSQL · **Payments:** Stripe
- **Shared types:** `packages/shared`
- **Tests:** Jest (API), Vitest + RTL (web), Playwright (e2e)
- **Node:** 24 LTS (see `.nvmrc`) · **pnpm:** 10 · **Turbo:** 2

## Local setup
```bash
nvm install        # uses .nvmrc → Node 24
nvm use
corepack enable    # provides pnpm
pnpm install
pnpm dev           # run all apps
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
> The `apps/` and `packages/` are scaffolded by the dev pipeline on the first `/build-story` run; until
> then this is config-only and CI passes via a "not scaffolded yet" guard.

## Branches & environments
| Branch    | Environment | Role                                  |
|-----------|-------------|---------------------------------------|
| `develop` | dev         | Default branch — feature PRs land here|
| `staging` | staging     | Pre-production validation             |
| `main`    | prod        | Production (protected release branch) |

Promotion flow: `feature/* → PR → develop → PR → staging → PR → main`.

## CI/CD
- **CI** (`.github/workflows/ci.yml`) runs on every **push and pull request** to `develop`, `staging`,
  `main`: lint → typecheck → unit tests → build, then **Playwright e2e** with a Postgres service.
- **CodeQL** (`.github/workflows/codeql.yml`) security scanning on push/PR + weekly.
- **CD** (`.github/workflows/deploy.yml`) runs on push to each env branch, maps it to its environment,
  and deploys — **but only once you add the matching secrets** (it no-ops otherwise).

### Deploy secrets (add in repo or Environment settings — never commit)
Per environment, prefixed `DEV_` / `STAGING_` / `PROD_`:
- `<ENV>_VERCEL_TOKEN`, `<ENV>_VERCEL_ORG_ID`, `<ENV>_VERCEL_PROJECT_ID` — web (Vercel)
- `<ENV>_API_DEPLOY_HOOK` — api deploy hook (Railway/Render/Fly)
- `<ENV>_DATABASE_URL` — environment database

> On a **private repo**, enforced branch protection and Environment approval gates require **GitHub Pro**.
> The rules are configured regardless and activate on upgrade; CI runs on all plans.
