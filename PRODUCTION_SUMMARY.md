# Postify — Production Architecture & Operations Summary
# Status: Production-Ready (Auth + LinkedIn) | Hardening in Progress
# Updated: 2026-06-14

---

## 1. Production Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                       │
│                                                                             │
│   User ──HTTPS──▶ Cloudflare (SSL termination, proxy)                      │
│                           │                                                 │
│                           │ dns: postify.applabx.com ──A──▶ 178.105.157.205│
│                           ▼                                                 │
│                    Hetzner Server (Ubuntu, Docker)                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Traefik v3.6 (port 80/443)                   │   │
│  │  • SSL cert via Let's Encrypt (auto-renew)                          │   │
│  │  • Routes: postify.applabx.com → app:3000                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │  Docker Compose (Coolify-managed)                                    │   │
│  │                                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │   │
│  │  │  app (Next)  │  │     db       │  │        redis            │ │   │
│  │  │  ttl.sh/...  │  │  postgres:16 │  │       redis:7           │ │   │
│  │  │  :latest     │  │  healthcheck │  │     healthcheck         │ │   │
│  │  │  port 3000   │  │  port 5432   │  │       port 6379         │ │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │   │
│  │         │                  │                     │                │   │
│  │  volumes: none (stateless)│  volumes: named     │  volumes:     │   │
│  │                              │  (eehzi4dz_..._    │  named (no    │   │
│  │                              │   postgres-data)   │  AOF persist) │   │
│  └──────────────────────────────┼─────────────────────┼───────────────┘   │
└─────────────────────────────────┼─────────────────────┼───────────────────┘
                                  │                     │
                                  ▼                     ▼
                    ┌──────────────────────┐  ┌─────────────────┐
                    │   Neon PostgreSQL   │  │  Redis Cloud    │
                    │   (Serverless)      │  │  (Coolify managed)│
                    │   Connection pooled │  │  BullMQ queue   │
                    │   postify DB        │  │  RAM only       │
                    │   No PITR configured│  │  No persistence │
                    └──────────────────────┘  └─────────────────┘

GitHub ──push──▶ GitHub Actions (ci.yml: lint+build)
                      │
                      ▼ (manual or future webhook)
              GitHub Container Registry (GHCR) — TO BE CONFIGURED
                      │
                      ▼
              Coolify ──pull──▶ ghcr.io/applabx/postify:latest
                      │                  ▲
                      │   (broken webhook)
                      │                  │
                      └──────────────────┘

Slack ←── Coolify webhook (to configure)
```

---

## 2. Deployment Architecture Diagram

```
GitHub (applabx/postify, master)
         │
         │ push
         ▼
   ┌─────────────┐
   │  CI (ci.yml) │  • npm ci
   │  runs on PR  │  • lint:gate
   │  + push      │  • build (--webpack)
   └──────┬──────┘
          │
          │ (manual or future)
          ▼
   ┌─────────────────────────┐
   │  Release (release.yml)  │  ← CREATE THIS
   │  on push to master       │  • Docker Buildx
   │                          │  • Push to GHCR
   │                          │  • Tags: sha-{SHA}, latest
   └────────────┬────────────┘
                │
                ▼
   GHCR: ghcr.io/applabx/postify
   (tags: sha-24ee6d3, latest)
                │
                │ (webhook broken ⚠️)
                ▼
   Coolify (https://coolify.applabx.com)
   ┌────────────────────────────────────┐
   │  Source: GitHub App (detached ⚠️)  │
   │  Webhook: false (needs reconnect) │
   │  Image: ghcr.io/applabx/postify    │  ← UPDATE THIS
   │  Compose: docker-compose.yaml      │
   │  Env vars: .env (Coolify-managed)  │
   └────────────┬───────────────────────┘
                │
                │ docker compose up -d
                ▼
   Hetzner: Docker containers start
   • app: pulls ghcr.io/.../latest
   • db:  postgres:16-alpine (local)
   • redis: redis:7-alpine (local)
```

---

## 3. Backup & Recovery Runbook

### Quick Recovery Reference

| Scenario | Time | Steps |
|---|---|---|
| App down (crash) | 2–5 min | Coolify auto-restarts; or `POST /start` via API |
| Redis data loss (scheduled jobs) | 5 min | Restart Redis; inform users to re-schedule |
| App container bad deploy | 5 min | `POST /start` with previous SHA tag |
| Neon DB corrupted | 15–30 min | Neon PITR restore → update env → restart |
| Hetzner server lost | 2–4 hrs | Provision new server → install Coolify → restore env |
| DNS failover | 30 sec – 24hr | Update Cloudflare A record |

---

## 4. Operations Runbook

### Manual Deploy (current — broken webhook)
```bash
# 1. Build and push image locally (or via CI)
docker build -t ghcr.io/applabx/postify:sha-$(git rev-parse --short HEAD) .
docker tag ghcr.io/applabx/postify:sha-$(git rev-parse --short HEAD) ghcr.io/applabx/postify:latest
docker push ghcr.io/applabx/postify:latest

# 2. Trigger Coolify restart (pulls latest image)
curl -X POST \
  -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/start"

# 3. Verify deployment
docker exec app-eehzi4dz98bay175wko3wqut-053141859747 printenv SOURCE_COMMIT
```

### Rollback to Previous Image
```bash
# 1. Identify good SHA from deployment history
curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/deployments?limit=10" \
  | python3 -m json.tool | grep commit

# 2. Pull the good image
docker pull ghcr.io/applabx/postify:sha-abc1234
docker tag ghcr.io/applabx/postify:sha-abc1234 ghcr.io/applabx/postify:latest
docker push ghcr.io/applabx/postify:latest

# 3. Restart container
curl -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/restart"
```

### Secret Rotation
```bash
# 1. Generate new secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -base64 32)

# 2. Update in Coolify dashboard → postify → Environment

# 3. Restart app container to pick up new secrets
curl -X POST -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/restart"
```

### Redis Persistence (enable AOF)
```bash
# Add to redis service in docker-compose.yaml on server:
# command: redis-server --appendonly yes
# Restart redis container
```

---

## 5. Remaining Risks

| # | Risk | Severity | Likelihood | Impact |
|---|---|---|---|---|
| R1 | Coolify GitHub webhook disconnected — no auto-deploy on push | HIGH | **Active now** | Cannot deploy by pushing to GitHub |
| R2 | `ttl.sh` image garbage-collected — deploy fails silently | HIGH | **Active now** | Production outage |
| R3 | Redis has no persistence — scheduled jobs lost on crash | MEDIUM | Low | Users lose scheduled posts |
| R4 | `deploy.sh` uses `db push --accept-data-loss` — destructive if run | HIGH | Low (not in CI/CD) | Data loss if used |
| R5 | `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` exposed to client | LOW | Medium | Leaks that dev bypass exists |
| R6 | No health endpoint — uptime monitors hit app via browser path | MEDIUM | Medium | Cannot distinguish app/infra failure |
| R7 | No migration history — `prisma migrate deploy` will fail on existing DB | HIGH | Low (manual step) | Schema changes require workarounds |
| R8 | No external monitoring — silent outages | MEDIUM | Medium | Outages undetected until users complain |
| R9 | Docker named volumes not backed up — DB/Redis data | MEDIUM | Low | Data loss if volume corrupted |
| R10 | Source commit `git_commit_sha = "HEAD"` — Coolify can't detect changes | HIGH | **Active now** | Deployment change detection broken |

---

## 6. Priority-Ranked Recommendations

| # | Action | Priority | Effort | Owner |
|---|---|---|---|---|
| **P1** | Reconnect GitHub App webhook in Coolify → Sources | CRITICAL | 15 min | Gilbert (UI) |
| **P2** | Update compose image to `ghcr.io/applabx/postify:latest` | CRITICAL | 10 min | Gilbert (Coolify) |
| **P3** | Create `.github/workflows/release.yml` and push to GitHub | CRITICAL | 30 min | Mavis (write) |
| **P4** | Enable GHCR anonymous access in GitHub repo Settings | CRITICAL | 5 min | Gilbert (GitHub) |
| **P5** | Change `NEXT_PUBLIC_ENABLE_DEV_AUTH=false` in Coolify env | HIGH | 5 min | Gilbert (Coolify) |
| **P6** | Create initial Prisma migration (baseline, no-op) | HIGH | 30 min | Mavis |
| **P7** | Replace `deploy.sh` `db push` with `migrate deploy` | HIGH | 15 min | Mavis |
| **P8** | Add `/api/health` endpoint to app | MEDIUM | 30 min | Mavis |
| **P9** | Configure Better Uptime / UptimeRobot monitoring | MEDIUM | 15 min | Gilbert |
| **P10** | Configure Coolify → Slack deployment webhook | MEDIUM | 10 min | Gilbert (Coolify UI) |
| **P11** | Enable Redis AOF persistence | LOW | 15 min | Gilbert (Coolify) |
| **P12** | Add Docker healthcheck to app container | LOW | 30 min | Mavis |
| **P13** | Add structured JSON logging | LOW | 1 hr | Mavis |
| **P14** | Run Phase 7 E2E QA checklist | MEDIUM | 1 hr | Gilbert |

---

## 7. Effort Estimates

| Item | Estimate | Confidence |
|---|---|---|
| GHCR workflow + push | 1 hr | High |
| Coolify webhook reconnect + image update | 30 min | High |
| Prisma migration baseline | 1 hr | High |
| Fix deploy.sh | 15 min | High |
| Health endpoint | 30 min | High |
| Uptime monitoring setup | 30 min | High |
| E2E QA run | 1–2 hrs | Medium |
| Redis AOF persistence | 15 min | High |
| Structured logging | 1 hr | Medium |
| Docker app healthcheck | 30 min | Medium |

**Total for full hardening: ~6–8 hours**
