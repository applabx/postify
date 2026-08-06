# Postify Operations Manual

Operator documentation for the SaaS deployment (web + worker + Redis +
PostgreSQL behind Coolify/Traefik/Cloudflare).

## 1. Deployment

### Automated (default)
Every push to `master` runs the certified Release pipeline
(`.github/workflows/release.yml`):

1. CI must pass for the same SHA (release gate).
2. Docker image builds with provenance+SBOM, Trivy scans (HIGH/CRITICAL gate),
   cosign keyless signing, OCI label verification.
3. Image is pushed to GHCR (`latest`, full-SHA, `release-<short>` tags).
4. A GitHub Release `release-<sha>` is created with `release-manifest.json`
   (git SHA, digest, timestamp, trivy/signature/SBOM results).
5. The smoke-test job polls production `/api/health` until `commit` matches
   the SHA and db/redis/queue/worker are healthy.
6. `release-checklist` confirms everything and prints "PRODUCTION-READY".

### Digest-pinned (immutable) deployment
Production currently builds from source (Coolify GitHub App). To pin the
running container to the certified GHCR digest:

```bash
./scripts/pin-coolify-digest.sh ghcr.io/applabx/postify@sha256:<digest>
```

With `COOLIFY_API_KEY` set this drives the Coolify API; otherwise it prints
the exact UI steps (Docker Image field + `CONTAINER_IMAGE` env var). After
the restart, `/api/health` reports `image` — the Release smoke test then
verifies it matches the release manifest (`PROD_REQUIRE_DIGEST=true` repo
variable enforces this strictly).

### Worker container (dedicated publishing)
Deploy a second container from the same image with:

```
PUBLISH_WORKER=true
```

and command `node worker.js` (migrations run at startup like the web
container). Multiple worker replicas are supported — Bull distributes jobs
and the DB claim guarantees zero duplicate publishes. Set web containers to
`PUBLISH_WORKER=false` once workers are live. If `PUBLISH_WORKER` is unset
(legacy), the web process processes jobs itself.

## 2. Rollback

See `ROLLBACK.md` and `scripts/rollback.sh`. Rollback NEVER uses `:latest`:

1. Pick the last good `release-<sha>` GitHub Release (Trivy PASS + smoke PASS).
2. `docker buildx imagetools inspect ghcr.io/applabx/postify@sha256:<digest>`
3. Coolify UI → postify → Docker Image = `ghcr.io/applabx/postify@sha256:<digest>` → Restart
   (or `COOLIFY_API_KEY=... ./scripts/rollback.sh sha256:<digest>`)
4. Verify `/api/health` commit == rollback SHA and all components healthy.

Migrations are forward-only and applied at container start — rolling back an
image does not roll back schema. See "Disaster recovery" for schema issues.

## 3. Disaster Recovery

- **Database**: Coolify managed PostgreSQL. Restore from the provider's
  backups. After restore, run `prisma migrate deploy` from a fresh container
  if schema is behind. Do NOT force-apply schema changes to bypass drift —
  restore from a verified backup instead.
- **Redis**: scheduled jobs live in Redis. With `appendonly yes` enabled,
  a restart preserves queued jobs; without persistence, queued delayed jobs
  are lost (scheduled DB rows survive — see "Queue recovery").
- **Whole stack**: deploy from the last certified `release-<sha>` digest,
  restore DB, start Redis with persistence, scale workers.

## 4. Queue Recovery

Scheduled posts are persisted in the DB (`Post.status=SCHEDULED` +
`ScheduledJob`). On startup, reconciliation (`lib/scheduler.ts`) recreates
missing Bull jobs for future scheduled posts (deterministic `post:<id>`
jobIds — never duplicates).

Manual recovery when jobs failed entirely inside an outage window (PENDING
targets, job in Bull's failed set):

```bash
# List failed jobs (redis):
redis-cli ZRANGE bull:postify:publish:failed 0 -1
# Re-enqueue from the DB: posts whose targets are PENDING and whose job is gone
```

The chaos harness demonstrates this drill automatically
(`scripts/chaos.mjs postgres-restart`).

## 5. Worker Recovery

- **Crash (SIGKILL)**: Bull lock (5 min) expires → stalled-job check re-runs
  the job. The DB claim (PENDING→PUBLISHING) prevents duplicate publishes;
  targets claimed just before the crash stay PUBLISHING and are marked FAILED
  "verify manually" by the 30-minute reconciliation — never auto-republished.
- **Graceful stop (SIGTERM)**: the worker pauses, lets active publishes
  finish, closes Redis/Prisma, exits 0 (~0.5s). Rolling deployments do not
  interrupt publishing.
- **Poisoned Prisma pool after a DB restart**: recycle the worker container
  (orchestrator restart policy does this); unclaimed jobs then complete.
- **Heartbeats**: workers write `postify:worker:<id>` in Redis every 15s
  (version, jobsProcessed, RSS). `/api/health.workers` and `/metrics`
  report them; a worker with a stale heartbeat is dead.

## 6. OAuth Troubleshooting

- **Connect button redirects to `http://0.0.0.0:3000`**: `NEXT_PUBLIC_APP_URL`
  must be the public HTTPS URL (internal hosts are rejected at startup).
- **LinkedIn rejects the whole request**: the app requests ONLY
  `openid profile email w_member_social` — any other scope makes LinkedIn
  refuse. Reconnect after org scopes are granted by LinkedIn review.
- **"Just a moment..." / 403 from Cloudflare**: Cloudflare bot-challenges
  datacenter egress (including GitHub runners). The smoke test falls back to
  the origin IP; for manual debugging use `curl --resolve`.
- **Token expiry**: tokens refresh via the daily cron (`refresh-tokens`);
  providers without refresh support (LinkedIn) need a manual reconnect.
- **State mismatch**: the OAuth state cookie lives 10 minutes; retry the
  connect flow. CSRF-protected by design.
- **Metrics**: `postify_oauth_attempts_total{platform,phase,result}` shows
  where a flow fails (start/callback × denied/state_mismatch/failure).

## 7. Production Certification

Every release certifies (automated in `release-checklist`): CI passed,
Docker build, Trivy (HIGH/CRITICAL), image published, OCI labels, cosign
signature, SBOM, migrations (applied at container start), container healthy,
health endpoint commit match, queue healthy. Manual per release: OAuth
connect smoke per platform (see `docs/OAUTH_CERTIFICATION.md`).

## 8. Observability

- `/api/health` — liveness + components + workers + image digest.
- `/api/metrics` — Prometheus (see `docs/GRAFANA.md`).
- Sentry — server + client errors, OAuth/publish/scheduler failures
  (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`; release = git SHA; PII scrubbed).

## 9. Soak & Chaos

```bash
docker run -d --name postify-soak-redis -p 6379:6379 redis:7-alpine --appendonly yes
npx tsx scripts/soak.mjs 60 3 150          # continuous publishing
npx tsx scripts/chaos.mjs sigterm          # graceful shutdown
npx tsx scripts/chaos.mjs sigkill          # crash recovery
npx tsx scripts/chaos.mjs redis-restart    # redis outage
npx tsx scripts/chaos.mjs postgres-restart # db outage + queue recovery drill
npx tsx scripts/chaos.mjs queue-growth     # 200-job burst
npx tsx scripts/chaos.mjs multi-worker     # 2 workers, zero duplicates
```

All scenarios run in `PUBLISH_DRY_RUN` mode (no external API calls) and use a
dedicated Redis (and optional `CHAOS_DATABASE_URL` for the postgres scenario).
