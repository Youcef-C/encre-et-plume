## What & why

<!-- What does this PR change, and which user story does it implement? -->
Implements: <!-- e.g. F-1, DR-3 --> 

## Checklist
- [ ] Linked to a user story in `user-stories/` (or explains why not)
- [ ] Every acceptance criterion in the story is met (Frontend + Backend)
- [ ] Tests added/updated and passing (Jest API · Vitest web · Playwright e2e where relevant)
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] French UI copy kept verbatim; code/identifiers in English
- [ ] Role authz enforced server-side where applicable (per `F-2`)
- [ ] No secrets committed; `.env.example` updated if new config was added

## Target branch
- [ ] `develop` (feature work) — default
- [ ] `staging` (promotion from develop)
- [ ] `main` (production release from staging)

## Notes for reviewers
<!-- Anything to look at closely, trade-offs, follow-ups. -->
