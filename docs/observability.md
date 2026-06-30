# Observability — F-9

Operational health signals for Encre & Plume. Dashboards and alerts live in external tools (Grafana/hosted APM). This document maps each story-named alert to its feeding signal.

---

## Signals exposed

| Signal | Endpoint / source | Notes |
|---|---|---|
| Liveness | `GET /health` → `{ status: "ok" }` always 200 | LB/orchestrator probe |
| Readiness | `GET /health/ready` → 200 / 503 with `{ checks: { db, redis } }` | DB + Redis ping |
| Prometheus metrics | `GET /metrics` → `text/plain; version=0.0.4` | Optional `METRICS_TOKEN` bearer gate |
| Structured JSON logs | stdout, one line per call | JSON with `ts`, `level`, `context`, `message`, `requestId` |
| Sentry error events | pushed on unhandled exceptions (5xx only) | NO-OP when `SENTRY_DSN` is absent |

### Key metric series

| Series | Labels | What it tracks |
|---|---|---|
| `http_requests_total` | `method`, `route`, `status` | RED request rate + error rate |
| `http_request_duration_seconds` | `method`, `route`, `status` | RED latency (histogram) |
| `jobs_completed_total` | `queue` | Job throughput |
| `jobs_failed_total` | `queue` | Per-attempt failures |
| `jobs_dead_letter_total` | `queue` | Permanently failed jobs |
| `job_duration_seconds` | `queue` | Job processing latency |
| `queue_depth` | `queue`, `state` | Real-time queue depth (waiting/active/failed/delayed) |
| `db_up` | — | 1 = DB reachable, 0 = down |
| `redis_up` | — | 1 = Redis reachable, 0 = down |
| `signups_total` | — | Business counter: user signups |
| `payments_total` | `status` | Business counter: declared, wired by MR epic |

---

## Alert rules (external — seam)

Alert rules live in Grafana/hosted tooling. Wire these PromQL expressions to your on-call channel.

| Alert | Signal | Example PromQL | Action |
|---|---|---|---|
| Error-rate spike | `http_requests_total{status=~"5.."}` | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | Check Sentry for traces; inspect recent deploys |
| Elevated latency | `http_request_duration_seconds` | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2` | Profile slow routes; check DB query times |
| Dead-letter queue growth | `jobs_dead_letter_total`, `queue_depth{state="failed"}` | `rate(jobs_dead_letter_total[10m]) > 0` | Inspect dead-letter queue via `GET /admin/queues/health`; check processor logs |
| Failed-payment/webhook backlog | `queue_depth{queue="stripe-events"}` | `queue_depth{queue="stripe-events",state="waiting"} > 100` | Check Stripe webhook logs; verify `STRIPE_WEBHOOK_SECRET` |
| DB down | `db_up`, `/health/ready` 503 | `db_up == 0` | Check Postgres connection pool; verify `DATABASE_URL` |
| Redis down | `redis_up`, `/health/ready` 503 | `redis_up == 0` | Check Redis; verify `REDIS_URL` |
| Low disk | host metrics via node-exporter | `node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1` | Infra-level; not tracked by the app |

**Note:** These are documented, not built in F-9. Set them up in your Grafana/AlertManager/hosted APM instance pointing at the `/metrics` endpoint.

---

## Source-map upload (seam — not built in F-9)

Source maps enable readable Sentry stack traces. To enable:

1. Set `SENTRY_AUTH_TOKEN` (org token from `sentry.io/settings/account/api/auth-tokens/`)
2. Set `SENTRY_RELEASE` to the git SHA / version tag in your CD pipeline
3. The `withSentryConfig` Next.js wrapper and the NestJS build are already wired; uploads activate when both vars are set.

Without `SENTRY_AUTH_TOKEN`, uploads are a no-op (CI-safe).

---

## DB connection-pool metrics upgrade (seam — not built in F-9)

To expose Prisma's internal connection-pool counters (`prisma_pool_connections_open`, etc.):

1. Enable the `metrics` preview feature in `schema.prisma`:
   ```prisma
   generator client {
     provider        = "prisma-client-js"
     previewFeatures = ["metrics"]
   }
   ```
2. Collect via `prisma.$metrics.prometheus()` and merge into the prom-client registry.

Deferred: requires a schema + client rebuild. The current `db_up` reachability gauge covers the critical alert path.

---

## OpenTelemetry distributed tracing (optional/later — not built in F-9)

For slow-request diagnosis across services:

1. Add `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`
2. Integrate with Sentry via `Sentry.init({ tracesSampleRate: 0.1 })` (already wired — just set `SENTRY_TRACES_SAMPLE_RATE > 0`)
3. Or export to Jaeger/Tempo via OTLP exporter

The per-request `requestId` (correlation id in logs and Sentry events) is the lightweight stand-in for now. Upgrade when distributed tracing becomes a diagnosed gap.
