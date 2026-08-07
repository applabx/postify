# Executive Summary

**FAIL** — the certified artifact is fully proven and the RC4 code is live in
production, but the remaining production deployment work (Coolify digest pin,
dedicated worker, web-only mode, Sentry, Redis AOF) requires Coolify UI/API or
SSH access, which is **not available in this environment**. One task was
completed this session (Task 4: `PROD_REQUIRE_DIGEST=true` enforced).

**Overall Production Readiness Score: 5.5 / 10**
(Certified image + pipeline + RC4 code live + digest enforcement: proven.
Deployment-state tasks 1, 2, 3, 5, 6, 9, 10: not executed — blocked on access.)

──────────────────────────────────────────────

# Environment

| Field | Value |
|---|---|
| Running Git SHA | `bb29def87c4e06c342687c7ebd4b0cad75b90743` (health `commit`; app code identical to frozen `49a1ced` — delta is docs-only; SOURCE_COMMIT reflects Coolify's deploy) |
| Running Image Digest | **null** (`health.image` unset — NOT digest-pinned) |
| OCI Revision | `49a1cedb2c44ea59d206de5d6d15bf1e01400c08` (certified image; running container revision not readable without server access) |
| Worker Count | **0** (`health.workers: []`) |
| Redis Status | healthy (health `components.redis`, metrics `postify_redis_up 1`) |
| PostgreSQL Status | healthy (health `components.db`, metrics `postify_postgres_up 1`) |
| BullMQ Status | healthy (health `components.queue`; queue depth all-zero — no workers consuming) |
| Sentry Status | **not configured** (no SENTRY_DSN verifiable; integration is a no-op without it) |

──────────────────────────────────────────────

# Verification Table

| Check | Status | Evidence |
|---|---|---|
| Certified digest pinned | FAIL | `health.image: null`; Coolify still runs its source build |
| Dedicated worker deployed | FAIL | `health.workers: []`; no worker heartbeats |
| Web container queue disabled | FAIL | `PUBLISH_WORKER` unset in Coolify — legacy mode (web can still process) |
| PROD_REQUIRE_DIGEST enabled | PASS | Repo variable set to `true` this session (release smoke gate now fail-closed) |
| Redis AOF enabled | FAIL | Not verifiable from here (no server access); metrics `redis_up 1` only proves reachability |
| Sentry configured | FAIL | No DSN verifiable; controlled test exception not possible without a DSN |
| Health endpoint | PASS | `/api/health` 200; all required fields present (`commit`, `image`, `workers`, `components`, `uptimeSec`) |
| Metrics endpoint | PASS | `/api/metrics` 200, Prometheus format; queue/worker/publish/http/process/redis/pg families registered |
| Queue processing | FAIL | Zero queue activity in production (no workers); machinery certified 10/10 in the production-equivalent environment (see Evidence) |
| OAuth | FAIL | Interactive flows not executable headless; endpoint auth-gating verified (start → 307 /login; `/login` 200) |
| Exactly-once publishing | PASS | State machine unchanged in the certified image; 10/10 scenario certification incl. SIGKILL showed zero duplicates and no replay of uncertain side effects |
| Crash recovery | FAIL | Not demonstrated in production (no access); SIGTERM/SIGKILL/Redis/PG recovery certified in the equivalent environment |
| Rollback safety | PASS | Drill executed (RC4 → `sha256:07d069fa…` → RC4, zero data loss); rollback target recorded |

──────────────────────────────────────────────

# Evidence

## Certified image (Task 1 baseline — release manifest `release-49a1ced…`, workflow run 31166818206)
```json
{"sha": "49a1cedb2c44ea59d206de5d6d15bf1e01400c08",
 "digest": "sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8",
 "published_at": "2026-08-07T09:43:06Z",
 "trivy": "passed (HIGH,CRITICAL, exit-code=1, ignore-unfixed)",
 "signature": "cosign keyless (sigstore)",
 "sbom": "cyclonedx (anchore/sbom-action)"}
```
OCI revision = `49a1ced…` (verified post-push by the pipeline's label-check step).
**Task 9 verdict**: certified digest `sha256:652a6a54…` vs running container digest = **unknown/null** → no match → FAIL.

## Health endpoint (Task 7 — full production response)
```json
{"status":"ok","timestamp":"2026-08-07T10:10:52.590Z",
 "commit":"bb29def87c4e06c342687c7ebd4b0cad75b90743",
 "image":null,
 "uptimeSec":1244,
 "components":{"db":"healthy","redis":"healthy","queue":"healthy","worker":"running"},
 "workers":[],
 "queue":{"waiting":0,"active":0,"completed":0,"failed":0,"delayed":0,"paused":0},
 "publish":{"published24h":0,"failedTargets24h":0}}
```
All required fields present. `image` and `workers` are null/empty because Tasks 1–2 are pending.

## Metrics endpoint (Task 8 — production excerpts)
```
postify_queue_jobs{state="waiting"} 0      active 0   completed 0   failed 0   delayed 0   paused 0
postify_worker_info                                    (registered; no samples — no workers)
postify_worker_jobs_processed_total                    (registered; no samples)
nodejs_process_memory_bytes{type="rss"} 113991680      heapUsed 46608032   heapTotal 55255040
nodejs_process_cpu_seconds_total 1.668604
postify_redis_up 1
postify_postgres_up 1
```
Families registered (Prometheus format, HELP/TYPE): `postify_publish_posts_total`,
`postify_publish_targets_total`, `postify_oauth_attempts_total`,
`postify_api_requests_total`, `postify_api_duration_seconds`,
`postify_queue_jobs`, `postify_worker_info`, `postify_worker_jobs_processed_total`,
`nodejs_process_memory_bytes`, `nodejs_process_cpu_seconds_total`,
`postify_redis_up`, `postify_postgres_up`.

## Queue processing / crash recovery / exactly-once (Task 10 — reference certification)
Production has no workers and no publishes to observe. The same certified
image (frozen source) was certified live in a production-equivalent stack
(web + 2 worker containers + Redis + PostgreSQL) — **10/10 scenarios PASS**
(`scripts/certify-production.mjs`): immediate, scheduled, multi-target,
simultaneous, worker restart, SIGTERM (20/20), SIGKILL (orphan never
republished), Redis reconnect, PostgreSQL reconnect, multi-worker —
**zero duplicate publishes everywhere**.

## OAuth / auth (Task 10 — external probes)
- `GET /login` → 200
- `GET /api/oauth/linkedin/start` (no session) → 307 → `https://postify.applabx.com/login` (auth-gating correct)
Interactive login/logout/OAuth/publish flows require a browser session with real provider credentials — not executable in this environment.

## Sentry (Task 5)
No `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` verifiable in production. Integration
is a strict no-op without a DSN (guarded; zero network calls). A controlled
test exception requires the operator-configured DSN.

## Digest enforcement (Task 4 — verified LIVE)
`PROD_REQUIRE_DIGEST=true` was set as a repo variable. The next release run
(`4e1586f`, 2026-08-07) **failed closed exactly as designed**:
- build-and-push ✓ (image `sha256:652a6a54…`-family built, Trivy/cosign/SBOM ✓)
- smoke-test ✗ → `::error:: deployment is not digest-pinned (health.image missing)`
This proves the enforcement is active: **no release can be certified until
production is pinned to the certified digest** — the intended cutover freeze.

## Redis (Task 6)
Externally: `postify_redis_up 1` + health `redis: healthy`. AOF
(`appendonly yes`) is a Coolify-compose setting — not readable without server
access → FAIL/not verifiable.

## Web startup logs / worker startup logs (Tasks 2–3)
Not obtainable without Coolify/SSH access. Reference logs from the
production-equivalent run (worker start, heartbeats, graceful shutdown) exist
from the freeze session.

──────────────────────────────────────────────

# Remaining Issues (genuine production blockers only)

1. **Coolify is not pinned to the certified digest** — the app still builds
   from source; `health.image` is null. The release manifest digest
   `sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8`
   must be set in Coolify (UI: Docker Image; plus `CONTAINER_IMAGE` env;
   `scripts/pin-coolify-digest.sh`).
2. **No dedicated worker container** — create a second Coolify app from the
   same digest, command `node worker.js`, `PUBLISH_WORKER=true`, with
   `DATABASE_URL`, `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, provider credentials,
   `SOURCE_COMMIT=49a1ced…`; no public domain required.
3. **Web container still in legacy mode** — set `PUBLISH_WORKER=false` on the
   web app after the worker is live.
4. **Sentry DSN absent** — set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`, then
   fire a test exception and confirm release=`49a1ced…`.
5. **Redis persistence not confirmed** — add `command: redis-server --appendonly yes`
   to the Coolify Redis service.
6. **`PROD_REQUIRE_DIGEST=true` is now active** — the Release smoke gate will
   fail closed on the next push until items 1–2 complete (intentional
   enforcement; complete the cutover in the same session).

**Production infrastructure is NOT fully certified.** The 12-line operator
runbook (all Coolify UI/API actions, no code changes) is in
`QA/Phase-11-Final-Cutover-Freeze-Report.md` §18. Until executed: certified
digest not pinned, no worker, web legacy-mode, Sentry/Redis-AOF unverified.
