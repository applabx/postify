# Phase 10 — RC4 Platform Scale & SaaS Readiness Report

**Date:** 2026-08-06
**Status:** COMPLETE — all phases implemented, soak/chaos verified locally; release certification pending GitHub Actions outage recovery
**Head commit:** `c21d6c5` (master)

---

## 1. Executive Summary

Postify moved from a single web process to a **web + dedicated worker
architecture** with immutable deployments, Prometheus metrics, Sentry
monitoring, an automated OAuth certification harness, and a full soak/chaos
suite. All reliability claims are backed by runtime evidence collected this
session (see §10–12). The release pipeline certification of this commit was
blocked by a **GitHub Actions major outage** (confirmed via githubstatus.com,
2026-08-06 ~19:30 UTC); the code is fully validated locally and the pipeline
is expected to certify on retry.

## 2. Architecture Changes

- **Dedicated publish worker** (`lib/worker.ts`, `worker/index.ts`,
  `scripts/build-worker.mjs`): same image, second entrypoint
  (`PUBLISH_WORKER=true node worker.js`). Multiple replicas supported
  (Bull distributes; DB claim guarantees zero duplicates — verified with 2
  concurrent workers, 40 jobs, 0 duplicates).
- **Processing-mode gating** (`lib/scheduler.ts`): `PUBLISH_WORKER=true` =
  worker; `false` = web never processes; unset = legacy single-process mode
  (backwards compatible — existing deployments keep working).
- **Worker heartbeats**: `postify:worker:<id>` in Redis every 15s with
  version (git SHA), jobsProcessed, RSS. Exposed via `/api/health.workers`
  and `/metrics`.
- **Graceful shutdown**: worker pauses → drains active jobs → closes
  Bull/Redis/Prisma → exit 0 (25s cap). Web: Next drains requests; queue
  paused in legacy mode.
- **Immutable deployments** (Phase 1): `/api/health.image` reports
  `CONTAINER_IMAGE`; `scripts/pin-coolify-digest.sh` pins Coolify to a GHCR
  digest; the Release smoke test asserts the running image matches the
  release manifest digest (`PROD_REQUIRE_DIGEST=true` makes it strict).
- **Dry-run publishing** (`PUBLISH_DRY_RUN` + `PUBLISH_DRY_RUN_DELAY_MS`):
  full queue/claim/finalize state machine without external API calls —
  enables soak/chaos/staging.

## 3. Operational Improvements

- `scripts/soak.mjs` + `scripts/chaos.mjs` (6 scenarios) + docs/OPERATIONS.md
  (deployment, rollback, DR, queue recovery, worker recovery, OAuth
  troubleshooting, certification).
- Scheduler retries 3 → 5 attempts with exponential backoff (covers short
  PostgreSQL/Redis restarts that previously could strand PENDING targets).
- Queue-recovery drill automated (re-enqueue stranded posts — the same
  procedure documented for operators).

## 4. Observability Improvements

- **`/api/metrics`** (prom-client): publish posts/targets by result+platform,
  queue depth by state, worker info/jobs/RSS, OAuth attempts by
  platform/phase/result, API requests+latency per route, process
  memory/CPU, Redis/PostgreSQL up.
- **Worker heartbeats** make worker connectivity observable without
  orchestrator access.
- **Sentry** (server + client): captures backend exceptions, React errors,
  OAuth failures (per platform/phase tags), publish-target failures, queue
  stalled/failed events, token-refresh failures, worker crashes. `beforeSend`
  scrubs Authorization/cookies/token query params. Release = git SHA.
  No-op without `SENTRY_DSN`.
- `docs/GRAFANA.md`: metric reference, recommended panels, alert thresholds,
  scrape config (incl. Cloudflare-origin fallback).

## 5. Reliability Improvements

- Graceful worker shutdown verified: SIGTERM mid-queue → exit 0 in ~0.5s,
  active jobs finished, zero loss (soak).
- SIGKILL mid-publish: DB claim prevents republish — the orphaned target
  stays PUBLISHING (never double-published) and awaits the 30-min
  reconciliation (evidence: 19 succeeded + 1 orphan, 0 duplicates).
- Redis restart with AOF: 20/20 jobs survived.
- PostgreSQL restart: unclaimed jobs recovered (19/20 terminal + 1 orphan,
  0 duplicates); stranded jobs recovered via the queue-recovery drill.
- 200-job burst and 2-worker concurrency: zero duplicates.
- Memory stability: worker RSS 90→94 MB over a 240-publish soak.

## 6. Security Improvements

- Sentry PII/secret scrubbing (auth headers, cookies, token query params).
- `/api/metrics` exposes counts/gauges only — no PII, no tokens, no per-user
  labels.
- OAuth telemetry never includes tokens; platform/phase/result only.
- Worker crash handlers capture + exit (no silent corruption).

## 7. Files Changed

| Area | Files |
|---|---|
| Worker | `lib/worker.ts`, `worker/index.ts`, `scripts/build-worker.mjs`, `lib/redis.ts`, `lib/scheduler.ts`, `instrumentation.ts`, `Dockerfile`, `.dockerignore`, `package.json` |
| Metrics | `lib/metrics.ts`, `app/api/metrics/route.ts`, `middleware.ts`, `lib/publisher.ts`, `lib/oauth/telemetry.ts`, oauth start + 5 callback routes |
| Sentry | `lib/sentry.ts`, `app/sentry-client.tsx`, `app/app-providers.tsx`, `app/layout.tsx`, `lib/token-refresh.ts` |
| Immutable deploys | `app/api/health/route.ts`, `scripts/pin-coolify-digest.sh`, `scripts/check-health.py`, `.github/workflows/release.yml` |
| OAuth harness | `tests/oauth-certification.test.ts`, `docs/OAUTH_CERTIFICATION.md` |
| Soak/chaos | `scripts/soak.mjs`, `scripts/chaos.mjs` |
| Ops docs | `docs/OPERATIONS.md`, `docs/GRAFANA.md` |
| Tooling fixes | `scripts/lint-gate.cjs` (maxBuffer), `eslint.config.mjs` (ignore dist), `.gitignore` |

## 8. Tests Added

`tests/oauth-certification.test.ts` — 7 tests: auth URL base/redirect/scopes/
state/PKCE for LinkedIn, Meta, Twitter, Pinterest, Tumblr; CSRF state cookie
validation (valid/mismatch/missing/cross-platform); callback error surfaces
per provider. Total test count 20 → 27.

## 9. Tests Executed

- Lint gate 29/29, `prisma validate` OK, full suite 27/27 pass, `next build
  --webpack` succeeds (all routes + middleware).
- Worker bundle builds (esbuild, 565 KB, externals resolved against the
  standalone output).

## 10. Runtime Evidence (soak — scripts/soak.mjs)

```
posts=80, targetsPerPost=3, delayMs=100
succeeded=240  failed=0  duplicatePublishes=0
queueDrainSeconds=10
workerShutdownMs=531  workerExitCode=0 (graceful SIGTERM)
rssMinMb=90  rssMaxMb=94  rssDeltaMb=4
processCpuUserMs=1099  processCpuSystemMs=342
```

## 11. Soak Test Results

One 240-publish soak (above) plus earlier runs (50 and 180 publishes) — all
zero failures, zero duplicates, sub-second graceful shutdown, flat RSS.

## 12. Chaos Test Results (scripts/chaos.mjs)

| Scenario | Result |
|---|---|
| SIGTERM mid-queue | exit 0; 40/40 succeeded after drain; 0 duplicates |
| SIGKILL mid-job | 19/20 terminal + 1 PUBLISHING orphan; **0 duplicates** (orphan awaits 30-min reconciliation — never republished) |
| Redis restart (AOF) | 20/20 succeeded; queue survived |
| PostgreSQL restart | 19/20 + 1 orphan; 0 duplicates; stranded PENDING recovered via queue-recovery drill |
| queue-growth (200) | 200/200; 0 duplicates |
| multi-worker (2×) | 40/40; 0 duplicates |

## 13. Remaining Risks

1. **GitHub Actions outage** blocked pipeline certification of this commit —
   rerun/re-dispatch on recovery; verify CI + Release + smoke green.
2. **Production still runs legacy mode** (web processes jobs) until the
   operator deploys the worker container and sets `PUBLISH_WORKER=false` on
   web. The health `worker` component only enforces heartbeats in split mode
   by design.
3. **Digest pinning is operator-driven** (Coolify UI/API): until
   `CONTAINER_IMAGE` is set, `health.image` is null and the digest check is
   advisory (strict mode via `PROD_REQUIRE_DIGEST=true`).
4. **Redis persistence** (appendonly) still not configured in production
   Coolify compose — jobs in RAM are lost on Redis crash (documented in
   OPERATIONS.md).
5. **Sentry DSN not set** in production — install once to activate error
   monitoring.
6. **PostgreSQL-restart orphans** wait up to 30 min for reconciliation —
   acceptable safety trade-off (never auto-republish).
7. Dependabot PR burst saturates the runner queue (outage-related).

## 14. Technical Debt

- Worker + web images are the same image with different entrypoints — could
  be split into two images for smaller worker pulls.
- `lib/redis.ts` shares a client with metrics/health/heartbeats; the rate
  limiter keeps a separate instance (acceptable, could be unified).
- API latency instrumentation covers main routes (posts/oauth/upload/
  accounts/analytics) — a Next request-logging middleware wrapper could
  extend coverage to all routes (requires server-side wrapper; deferred).
- OAuth refresh flows tested via URL construction; end-to-end refresh calls
  need a live provider account (manual step, documented).
- `docs/GRAFANA.md` contains dashboard guidance; an importable dashboard
  JSON is future work.
- No automated OAuth browser step (documented manual procedure per provider).

## 15. Exact Git Commit Hash

- **`c21d6c5`** (head, includes the docker-context fix)
- `702bcb1` — RC4 feature commit (39 files)
- `46dd494` — empty retrigger commit (superseded by c21d6c5)

## 16. Rollback Verification

- `scripts/rollback.sh` + `ROLLBACK.md` unchanged from Phase 9 (digest-pinned,
  verified procedure).
- New: `scripts/pin-coolify-digest.sh` verifies the digest exists in GHCR
  before pinning and records the decision in `RELEASE_ROLLBACK_LOG.md`.
- Rollback target for RC4: previous certified release `9a3f76aa` / its digest
  from the release manifest.
- Health `image` field lets any operator verify the running container digest
  without server access.

## 17. Updated Production Readiness Score

**9.6 / 10** (from ~9.5). Gains: dedicated worker architecture + graceful
shutdown + zero-duplicate proof, /metrics, Sentry-ready, digest-pinning
tooling, soak/chaos automation, ops manual. Remaining gap: production still
runs legacy mode until the worker container + digest pin are applied
(operator steps in docs/OPERATIONS.md, §1–2).
