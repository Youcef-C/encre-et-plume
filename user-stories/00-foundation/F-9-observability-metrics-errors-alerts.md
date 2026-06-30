# F-9 — Observability: metrics, error tracking & alerts

**As a** platform operator, **I want** error tracking (Sentry), metrics, structured logs, health checks, and alerting across the API and web app, **so that** I can detect, diagnose, and be paged on failures before they affect users — keeping the platform robust as it scales to tens of thousands of users.

> Screen(s): none in-app (external dashboards: Sentry, metrics/APM) + a `/health` endpoint · Priority: Must · Fidelity: Inferred

## Frontend
- No user-facing UI. The web app ([[F-4]] shell) is instrumented for client-side error capture and basic web-vitals/perf reporting; dashboards live in external tools, not in-product.

## Backend
- **Error tracking**: integrate **Sentry** (or equivalent) in `apps/api` (NestJS) and `apps/web` (Next.js) — capture unhandled exceptions with request context (route, user id, correlation id), tag the release/version, upload source maps for readable stack traces, and **scrub PII/secrets** from payloads.
- **Structured logging**: JSON logs with a **correlation/request id** propagated through a request (and into [[F-8]] jobs), explicit log levels, and **no secrets or PII** in log output.
- **Metrics**: expose app + infra metrics for Prometheus/hosted APM and build dashboards — request **rate / latency / error-rate** (RED) per route, queue depth + job failures (from [[F-8]]), DB connection-pool usage, Redis health, and key business counters (signups, payments succeeded/failed).
- **Health/readiness**: `GET /health` (liveness) and a readiness check (DB + Redis reachable) for the load balancer / orchestrator; used for zero-downtime rollouts.
- **Alerting**: alerts routed to an on-call channel on — error-rate spike, elevated latency, queue **dead-letter** growth, failed-payment / webhook backlog ([[F-8]]), DB or Redis down, low disk. Each alert is actionable (what + where).
- **Tracing** (optional/later): OpenTelemetry distributed tracing for slow-request diagnosis.
- Authorization: dashboards/alerting are operator tools (outside the app's role model); any in-app status surface is `admin` only ([[F-2]]).

## Dependencies
- [[F-1]] — request/session context attached to errors and logs.
- [[F-8]] — queue depth, job failures, and dead-letter feed metrics + alerts.
- Cross-cutting — every epic benefits; this should be in place early so all subsequent stories ship observable.

## Notes
- Inferred/technical: no prototype frame; an operational baseline.
- Distinct from [[AD-10]] (user **action log** — a product/audit feature, in-app, per user) and [[AD-7]] (platform **product** stats). F-9 is **operational health** — exceptions, latency, uptime, alerts — for engineers/operators, not a product surface.
- **Privacy (RGPD)**: error payloads and logs must not contain passwords, tokens, full payment details, or message bodies; scrub before sending to third-party tools.
