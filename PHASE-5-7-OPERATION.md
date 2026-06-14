# Phase 5 — Disaster Recovery Documentation
# Audit date: 2026-06-14

---

## Database (Neon — PostgreSQL)

### Backup Strategy
| Layer | Detail |
|---|---|
| Type | Neon "Serverless" (connection-permitting) |
| Retention | Neon retains point-in-time recovery (PITR) for 7 days on Pro plan |
| Manual backups | Not yet configured |
| Barmed schema | `User`, `SocialAccount`, `Post`, `PostTarget`, `ScheduledJob` — applied via `$executeRawUnsafe` (no migration history) |

### Risk: No Migration History
The production schema was applied via `prisma db push` equivalent — no entries in `_prisma_migrations`. This means:
- `prisma migrate status` shows "N migrations to apply" (none applied)
- `prisma migrate deploy` would try to re-apply the entire schema
- On a fresh Neon DB, this works (no conflict). On existing DB, Prisma may prompt `--accept-data-loss`

### Restore Procedure
1. Go to **Neon Console → Project → Branches → main → Backups**
2. Select a point-in-time recovery point or a manual snapshot
3. Restore to a new branch (e.g., `restore-$(date +%Y%m%d)`)
4. Update `DATABASE_URL` in Coolify `.env` to point to the restored branch URL
5. Restart app container: `docker restart app-eehzi4dz98bay175wko3wqut-053141859747`
6. Verify: connect to DB and check `SELECT COUNT(*) FROM "User"`

**Recovery Time Estimate:** 15–30 minutes (Neon PITR restore + env update + restart)

### Worst Case: Full Data Loss
If Neon loses all data:
1. The app has no user data (test data only in production currently)
2. Re-initialize: run schema push from container (after proper migrations are set up)
3. Re-seed test accounts as needed

---

## Redis (Coolify Managed — no persistent volume backup)

### Persistence Strategy
| Layer | Detail |
|---|---|
| Redis type | Managed by Coolify (Redis 7 Alpine) |
| Volume | Docker named volume: `eehzi4dz98bay175wko3wqut_redis-data` |
| Persistence config | Default `appendonly no` — **data is NOT persisted to disk** |
| What it holds | BullMQ job queue (scheduled posts) |
| Data loss on crash | YES — unsent scheduled jobs are lost |

### Failure Behavior
- Redis container dies → BullMQ cannot retrieve pending jobs → scheduled posts are silently skipped
- Jobs are stored only in Redis RAM, not persisted
- No automatic failover (single Redis instance)

### Recovery Procedure
1. Redis restarts automatically (Docker `restart: unless-stopped`)
2. On restart, Redis comes up empty — no jobs in queue
3. Scheduled posts that were queued but not processed are lost
4. No automatic replay mechanism exists

### Mitigation
Enable AOF persistence (survives Redis restart):
```yaml
# Add to redis service in docker-compose.yaml
command: redis-server --appendonly yes
volumes:
  - redis_data:/data
```
This makes Redis write every write to `/data/appendonly.aof`. On restart, it replays the log.

**Recovery Time Estimate:** 2–5 minutes (Redis auto-restart)

---

## Coolify (Self-Hosted on Hetzner)

### Rebuild Server Procedure
**Scenario:** Hetzner server is lost (hardware failure, accidental wipe)

1. **Spin up new Hetzner server** with Ubuntu 22.04 LTS
2. **Install Coolify:**
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
3. **Restore Coolify data** (if backups configured):
   ```bash
   # Coolify stores all data in /data/coolify
   # If /data is on a separate volume, attach it to the new server
   # If not: use Coolify's backup/restore feature
   ```
4. **Re-register the Postify app:**
   - Add new Server (localhost)
   - Create new Project
   - Add Application → Connect GitHub App → `applabx/postify`
   - Add Environment Variables (see Phase 4.4 inventory)
5. **Pull latest image and start:**
   ```bash
   docker pull ghcr.io/applabx/postify:latest
   docker compose up -d
   ```

**Recovery Time Estimate:** 2–4 hours (server provisioning + Coolify install + restore)

### Restore App Procedure (same server, app deleted)
1. Go to Coolify → Project → Add new Application
2. Connect GitHub source → `applabx/postify`
3. Set environment variables from Phase 4.4 inventory
4. Coolify auto-detects `docker-compose.yaml` and deploys
5. Verify all containers running: `docker ps`

### Restore Environment Variables Procedure
1. Go to Coolify → postify → Environment → Variables
2. Add each variable from Phase 4.4 inventory
3. Restart containers: `POST /api/v1/applications/{uuid}/restart`

---

## Domain & SSL

### DNS Ownership
| Item | Value |
|---|---|
| Domain | `applabx.com` (registered at Namecheap/GoDaddy/other) |
| DNS Provider | **Cloudflare** (free plan, `applabx.com` zone) |
| NS records | Pointing to Cloudflare nameservers |
| A record | `postify.applabx.com` → Hetzner server IP |

### Cloudflare Configuration
| Record | Value |
|---|---|
| Type | A |
| Name | `postify` |
| Content | `178.105.157.205` |
| Proxy status | **Proxied (orange cloud)** — Cloudflare handles SSL termination |

### SSL Renewal Path
- SSL is handled by **Cloudflare** (not by the app or Traefik directly)
- Cloudflare issues a free Origin Server TLS certificate for `postify.applabx.com`
- Cloudflare auto-renews; no manual action needed
- If using Traefik Let's Encrypt instead: Traefik v3 on Coolify auto-requests and renews certificates via `certificatesResolvers.letsencrypt`

### Recovery: DNS Failover
**Scenario:** Hetzner server IP changes or goes down

1. Update Cloudflare A record: `postify.applabx.com` → new IP
2. Cloudflare propagates within 30 seconds (proxied) or up to 24h (DNS-only)
3. If migrating to new provider: change NS records at registrar to new provider's nameservers

**Recovery Time Estimate:** 30 seconds – 24 hours (depending on DNS cache)

### Recovery: Losing Cloudflare Access
1. Log in at `dash.cloudflare.com` with account credentials
2. If 2FA lost: use account recovery codes or contact Cloudflare support
3. If domain registrar account lost: recover via registrar's account recovery
4. **Mitigation:** Save Cloudflare account recovery codes, store in password manager

---

## Phase 6 — Observability Audit

### Current State

| Layer | Item | Status | Notes |
|---|---|---|---|
| **App — Logging** | `console.error` in API routes | ⚠️ MINIMAL | No structured logger; logs go to Docker container stdout |
| **App — Health** | `/api/health` endpoint | ❌ MISSING | No health check route; Cloudflare gets 403 (Traefik → auth redirect) |
| **App — Auth failures** | Login failures logged? | ⚠️ UNKNOWN | Need to check NextAuth event handlers |
| **App — OAuth failures** | OAuth error tracking | ⚠️ UNKNOWN | No explicit error logging |
| **Infra — DB health** | `pg_isready` healthcheck | ✅ YES | In docker-compose.yaml, 10s interval |
| **Infra — Redis health** | `redis-cli ping` healthcheck | ✅ YES | In docker-compose.yaml, 10s interval |
| **Infra — App health** | Container-level health check | ❌ MISSING | App container has NO Docker healthcheck |
| **Infra — SSL** | SSL certificate monitoring | ✅ AUTO | Cloudflare handles; Traefik logs certificate status |
| **Alerts — Uptime** | Uptime monitoring | ❌ NONE | No external monitoring (UptimeRobot, Better Uptime, etc.) |
| **Alerts — Deploy** | Deployment notifications | ⚠️ SLACK | Slack webhook can be configured in Coolify |
| **Alerts — DB/Redis** | Connectivity alerts | ❌ NONE | No alerts if DB or Redis goes down |

### Minimal Implementation Plan

#### 1. Add `/api/health` endpoint (30 min)
Create `app/api/health/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'

const prisma = new PrismaClient()
const redis = createClient({ url: process.env.REDIS_URL })

export async function GET() {
  const checks: Record<string, string> = {}
  let healthy = true

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.db = 'ok'
  } catch (e) {
    checks.db = 'fail'
    healthy = false
  }

  try {
    await redis.connect()
    await redis.ping()
    checks.redis = 'ok'
    await redis.quit()
  } catch (e) {
    checks.redis = 'fail'
    healthy = false
  }

  return NextResponse.json({ status: healthy ? 'ok' : 'degraded', checks }, {
    status: healthy ? 200 : 503,
  })
}
```

Then enable health check in Coolify:
- Path: `/api/health`
- Interval: 30s
- Expected: 200

#### 2. Add structured logging (1 hr)
Replace `console.log/error` with a lightweight logger. No new dependency needed — Next.js `next: { logger }` or simple JSON to stdout:
```typescript
const log = (level: 'info' | 'error' | 'warn', msg: string, meta?: object) => {
  process.stdout.write(JSON.stringify({ level, msg, ...meta, ts: new Date().toISOString() }) + '\n')
}
```

#### 3. External uptime monitoring (15 min setup)
Sign up for **Better Uptime** (free tier: 1 monitor) or **UptimeRobot** (free: 50 monitors):
- URL: `https://postify.applabx.com`
- Check interval: 1 minute
- Alert: email + Slack webhook
- This catches: app down, DB down, SSL expired, domain expired

#### 4. Coolify deployment webhook to Slack (10 min)
Coolify → postify → Settings → Webhooks → Add:
- URL: `https://hooks.slack.com/services/{TEAM_ID}/{CHANNEL_ID}/{TOKEN}` _(retrieve from password manager)_
- Events: Deployment started, Deployment succeeded, Deployment failed

---

## Phase 7 — E2E QA Checklist

Test as a completely new user (anonymous browser, no prior session).

### Test Accounts
- Email for registration: use a disposable email (e.g., `tempmail.com`)
- LinkedIn: use a test LinkedIn account with a sandbox organization

### Checklist

```markdown
## Phase 7 E2E Production QA

### Auth Flow
- [ ] 1. Register: /register → create account with real email → verify email token arrives
- [ ] 2. Email verification: click link in email → redirected to app, account verified
- [ ] 3. Login: /login → enter credentials → redirected to /compose
- [ ] 4. Logout: click logout → redirected to /login, session cleared
- [ ] 5. Forgot password: /forgot-password → enter email → reset email arrives
- [ ] 6. Reset password: click reset link → set new password → redirected to /login
- [ ] 7. Login with new password: verify new credentials work
- [ ] 8. Protected route: visit /compose without session → redirects to /login

### Platform Connection
- [ ] 9. Connect LinkedIn: /accounts → "Connect LinkedIn" → OAuth flow → authorize → redirected back → account appears as connected
- [ ] 10. OAuth error: deny LinkedIn authorization → redirected back with error shown
- [ ] 11. Disconnect: /accounts → disconnect LinkedIn → confirmation → removed

### Post Creation
- [ ] 12. Create post: /compose → enter text + select LinkedIn → validate
- [ ] 13. Save draft: save post without publishing → appears in /queue as "draft"
- [ ] 14. Schedule post: set future datetime → post appears in /queue as "scheduled"
- [ ] 15. Publish immediately: publish now → post sent → /history shows "published"
- [ ] 16. Analytics: /analytics → page loads → shows published post stats

### Account Deletion
- [ ] 17. Delete account connection: /accounts → remove LinkedIn → confirm → removed
```

### Notes
- Steps 1–7 require email delivery. Use a real email or a service like Mailtrap.
- Step 12–15 require a connected LinkedIn account with `w_organization_social` permission.
- Steps 12–16 require a connected DB and Redis (both healthy).
- No automated test suite currently exists for E2E flows.
