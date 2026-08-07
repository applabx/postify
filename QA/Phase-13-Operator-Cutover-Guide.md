# Phase 13 — Final Production Cutover (Operator Mode)

**Date:** 2026-08-07
**Role:** Senior DevOps Engineer — production cutover configuration
**Mode:** Operational only. No source code modified (verified: zero diffs this session).

---

## Deliverable 1 — Executive Summary

The application and release pipeline are production-complete. The only
remaining work is Coolify configuration: pin the web app to the certified
immutable digest, add a dedicated worker app from the same digest, switch the
web to `PUBLISH_WORKER=false`, add Sentry DSNs, and enable Redis AOF. This
document is the exact, step-by-step operator guide for those actions, with
verified current-state evidence and the post-cutover validation checklist.
No engineering changes are recommended.

## Deliverable 2 — Production Readiness Score

- **Now:** 9.7 / 10 (certified artifact + pipeline + RC4 code live; deployment-state tasks pending)
- **After cutover (checklist below):** 9.8 / 10 — remaining 0.2 = per-release manual OAuth connect verification (browser-required by provider policy) and worker /metrics exposure.

## Deliverable 3 — Remaining Blockers

1. Coolify still source-builds the web app (health `image: null`).
2. No dedicated worker container (`health.workers: []`).
3. Web in legacy mode (`PUBLISH_WORKER` unset → web may process jobs).
4. Sentry DSNs absent.
5. Redis AOF not verified.
6. `PROD_REQUIRE_DIGEST=true` is correctly fail-closing the release gate until 1–2 are done (verified live: release `4e1586f` smoke ✗ "deployment is not digest-pinned").

---

## Phase 1 — Current Deployment Audit (evidence)

| Item | Current state | Evidence |
|---|---|---|
| Running image | Coolify **source build** (not a GHCR pull) | `health.image: null`; code label `commit: 17565ef…` updated per deploy |
| GHCR certified digest | `sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8` | Release manifest `release-49a1ced…` (run 31166818206), Trivy PASS, cosign, SBOM |
| OCI revision | `49a1cedb2c44ea59d206de5d6d15bf1e01400c08` | Pipeline label-verify step (workflow log) |
| Commit SHA | Running `17565ef…` (app code identical to frozen `49a1ced`; delta is docs-only); frozen = `49a1ced` | `git log` + health `commit` |
| Coolify deployment method | Source build via GitHub App webhook (webhook verified working; rebuilds on every push) | health `commit` changes each push; `image` stays null |
| Worker deployment | None | `health.workers: []`; no `postify:worker:*` heartbeats |
| Environment variables | `PUBLISH_WORKER` unset; `CONTAINER_IMAGE` unset; `SOURCE_COMMIT` set by Coolify; `SENTRY_DSN` unset | health behavior (legacy worker component), `image: null` |
| Redis configuration | Reachable (`redis_up 1`, health `redis: healthy`); **AOF unverified** | `/api/metrics`, `/api/health` |
| Sentry configuration | Not configured | no DSN verifiable; integration is a no-op without it |

---

## Phase 2 — Exact Operator Checklist (Coolify)

> Coolify instance: `https://coolify.applabx.com` (Project: `postify`; app UUID `eehzi4dz98bay175wko3wqut`).
> Old values marked *(verify)* are shown as observed-current; confirm in the UI before saving.

### Step A — Pin the web app to the certified digest
| Resource | Page | Field | Old value | New value | Restart |
|---|---|---|---|---|---|
| Web app | Configuration → Build Pack | Build Pack | `dockerfile` (source build) *(verify)* | `dockerimage` | Yes (deploy) |
| Web app | Configuration → Docker Image | Docker Image | *(empty / source ref)* | `ghcr.io/applabx/postify@sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8` | Yes (deploy) |

### Step B — Web environment
| Resource | Page | Field | Old value | New value | Restart |
|---|---|---|---|---|---|
| Web app | Environment | `CONTAINER_IMAGE` | *(unset)* | `ghcr.io/applabx/postify@sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8` | Yes |
| Web app | Environment | `PUBLISH_WORKER` | *(unset)* | `false` | Yes |
| Web app | Environment | `SOURCE_COMMIT` | Coolify-set value | `49a1cedb2c44ea59d206de5d6d15bf1e01400c08` (pin the health commit) | Yes |
| Web app | Environment | `SENTRY_DSN` | *(unset)* | `https://<key>@o<org>.ingest.sentry.io/<project>` | Yes |
| Web app | Environment | `NEXT_PUBLIC_SENTRY_DSN` | *(unset)* | same DSN (public) | Yes |
| Web app | Environment | `NEXT_PUBLIC_APP_URL` | `https://postify.applabx.com` *(verify)* | unchanged | — |

### Step C — Dedicated worker application
| Resource | Page | Field | Old value | New value | Restart |
|---|---|---|---|---|---|
| New app | Project → postify → + New Application → Docker Image | Build Pack | — | `dockerimage` | Yes (initial deploy) |
| Worker app | Configuration → Docker Image | Docker Image | — | `ghcr.io/applabx/postify@sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8` | — |
| Worker app | Configuration → Docker Command | Docker Command | — | `node worker.js` | — |
| Worker app | Configuration → Domains | Domain | — | *(leave empty — no public domain)* | — |
| Worker app | Environment | `PUBLISH_WORKER` | — | `true` | — |
| Worker app | Environment | `DATABASE_URL` | — | same managed-PG URL as web | — |
| Worker app | Environment | `REDIS_URL` | — | same managed-Redis URL as web | — |
| Worker app | Environment | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL` | — | same values as web | — |
| Worker app | Environment | provider creds: `LINKEDIN_CLIENT_ID/SECRET`, `META_CLIENT_ID/SECRET`, `TWITTER_CLIENT_ID/SECRET`, `PINTEREST_CLIENT_ID/SECRET`, `TUMBLR_CONSUMER_KEY/SECRET`, `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | — | same values as web | — |
| Worker app | Environment | `SENTRY_DSN`, `SOURCE_COMMIT` (`49a1ced…`), `CONTAINER_IMAGE` (digest) | — | as web | — |
| Worker app | General | Restart policy | — | `unless-stopped` | — |

### Step D — Redis AOF persistence
| Resource | Page | Field | Old value | New value | Restart |
|---|---|---|---|---|---|
| Redis service | postify → redis → Advanced / Docker | Command | `redis-server` *(verify)* | `redis-server --appendonly yes` | Yes (recreate) |

### Step E — Release gate
`PROD_REQUIRE_DIGEST=true` is already set (repo variable) — **no action**. After Steps A–C, the next push's smoke test will pass and re-open the gate.

---

## Phase 3 — Exact Worker Deployment Specification

- **Image**: `ghcr.io/applabx/postify@sha256:652a6a54b8fc8c269868ce3e5d523bf9cb7c670f9aef09f06d1daa8a1f9917e8` (identical digest to web — never a different image)
- **Start command**: `node worker.js` (the bundled worker entrypoint ships inside the image at `/app/worker.js`)
- **Environment** (required — from `lib/env.ts` + worker): `PUBLISH_WORKER=true`, `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `SOURCE_COMMIT=49a1cedb2c44ea59d206de5d6d15bf1e01400c08`, `CONTAINER_IMAGE=<digest ref>`, provider credentials (LINKEDIN/META/TWITTER/PINTEREST/TUMBLR/CLOUDINARY), `SENTRY_DSN` (optional)
- **Health check**: the image's built-in HEALTHCHECK probes HTTP :3000, which the worker does not serve. Do **not** enable Coolify "restart on unhealthy" for the worker. Liveness is provided by the worker heartbeat → web `/api/health.workers` + `/api/metrics` (`postify_worker_info`). If the platform supports command healthchecks, use:
  `node -e "const R=require('ioredis');const r=new R(process.env.REDIS_URL||'redis://127.0.0.1:6379',{maxRetriesPerRequest:1,enableOfflineQueue:false});r.ping().then(p=>process.exit(p==='PONG'?0:1)).catch(()=>process.exit(1))"`
- **Restart policy**: `unless-stopped`
- **Scaling**: start with **2 replicas** (multi-worker certified: 2 workers, 40 jobs, zero duplicates). Scale horizontally by adding replicas; the DB claim (PENDING→PUBLISHING) guarantees no duplicate publishes.
- **Networking**: internal only — no public domain. Must reach the managed PostgreSQL and Redis (same private network as web).
- **Volumes**: none required (no local state; all state in PostgreSQL/Redis).

---

## Phase 4 — Exact Web Deployment Changes

1. **Digest pin**: Build Pack → `dockerimage`, Docker Image = the certified digest (Step A).
2. **`PUBLISH_WORKER=false`**: web never registers the Bull processor (verified mode gating; scheduler/reconciliation unaffected — they run in the web process by design).
3. **`CONTAINER_IMAGE`**: set so `/api/health.image` reports the digest.
4. **Health checks**: image HEALTHCHECK (HTTP :3000 `/api/health`) works for web — no change.
5. **Verification after deploy**:
   - `curl -s https://postify.applabx.com/api/health` → `commit=49a1ced…`, `image=ghcr.io/applabx/postify@sha256:652a6a54…`, `workers: […]`
   - `/api/metrics` → `postify_worker_info{…}` present

---

## Phase 5 — Production Validation Checklist

```
□ /api/health 200 — commit=49a1ced…, image=sha256:652a6a54…, workers≥1, components healthy
□ /api/metrics 200 — Prometheus; postify_queue_jobs / postify_worker_info / publish counters / api_duration
□ Worker heartbeat — health.workers shows id+version=49a1ced…+jobsProcessed+rssMb (fresh <60s)
□ Queue — postify_queue_jobs{waiting/active/delayed} moves with test publishes
□ Redis — postify_redis_up 1; AOF: docker exec <redis> redis-cli config get appendonly → yes
□ PostgreSQL — postify_postgres_up 1
□ OAuth — connect a throwaway account per platform; callback lands on /accounts?success=<p>
□ Draft publish — create draft → save → status DRAFT
□ Scheduled publish — schedule +2h → job in delayed → publishes at T; exactly once
□ Exactly-once — externalPostId unique per target (no duplicates)
□ Crash recovery — kill -9 a worker mid-publish → target stays PUBLISHING, never republished; reconciliation marks FAILED "verify manually"
□ Image digest — health.image == sha256:652a6a54…
□ OCI revision — 49a1ced…
□ Commit SHA — 49a1ced…
```

Verification commands:
```bash
curl -s https://postify.applabx.com/api/health | jq '{commit,image,workers,components}'
curl -s https://postify.applabx.com/api/metrics | grep -E 'postify_(queue_jobs|worker_info|redis_up|postgres_up)'
curl -sI https://postify.applabx.com/login | head -1
```

---

## Deliverable 4 — Step-by-Step Operator Guide

1. Coolify UI → postify project → web app → Configuration → Build Pack `dockerimage` + Docker Image `<certified digest>` → Save → Deploy (Step A).
2. Web app → Environment → add `CONTAINER_IMAGE`, `PUBLISH_WORKER=false`, `SOURCE_COMMIT=49a1ced…`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` → Save → Restart.
3. Create worker app (Step C) with command `node worker.js` and env table → Deploy; then add a second replica.
4. Redis → Advanced → Command `redis-server --appendonly yes` → Restart.
5. Wait for web healthy → verify `/api/health` (commit/image/workers) and `/api/metrics`.
6. Publish a test post (immediate + scheduled) and watch the queue drain with the worker heartbeats incrementing.
7. Confirm `PROD_REQUIRE_DIGEST=true` gate passes on the next release (push a trivial commit or run `gh workflow run release.yml --ref master`).
8. In Sentry, fire a test exception; confirm release tag `49a1ced…` and no secrets/PII in the payload.
9. Record the pre-cutover running image digest from `docker inspect` on the host as the true rollback target (in addition to the certified previous `sha256:07d069fa…`).

## Deliverable 5 — Rollback Plan

- **Rollback target**: `ghcr.io/applabx/postify@sha256:07d069fa9734a05977b740acc1138df6aba8253571bf34c7f3d15fd63efce081` (commit `9a3f76aa`, last certified pre-RC4) — plus the host's actual pre-cutover digest captured in step 9 above.
- **Procedure**: Coolify → web app → Docker Image = rollback digest (+ `CONTAINER_IMAGE` to match, `PUBLISH_WORKER=false` or unset) → Deploy. Worker app: scale to 0 (or same rollback digest). Verify `/api/health` commit/image. **Migrations are forward-only** — do not roll back schema; the rollback image is schema-compatible (verified in drill: marker post survived RC4→9a3f76aa→RC4).
- **Automated**: `scripts/rollback.sh` / `scripts/pin-coolify-digest.sh` with `COOLIFY_API_KEY` set; otherwise the UI steps above.

## Deliverable 6 — Expected Production State After Cutover

```
Web container  : ghcr.io/applabx/postify@sha256:652a6a54…  PUBLISH_WORKER=false
Worker(s)      : same digest, PUBLISH_WORKER=true, node worker.js, 2 replicas
health         : commit=49a1ced…, image=sha256:652a6a54…, workers≥1, components healthy
metrics        : queue/worker/publish/http/redis/pg families live
Sentry         : DSNs set; release 49a1ced…; PII/secret scrubbed
Redis          : appendonly yes (AOF)
Release gate   : PROD_REQUIRE_DIGEST=true passes (smoke verifies digest + workers)
Rollback       : sha256:07d069fa… (9a3f76aa) + host pre-cutover digest
```

---

"The repository is production-ready. The remaining work is entirely operational within the deployment environment. No additional engineering changes are recommended until production cutover is complete. Development should then shift to customer-facing features."
