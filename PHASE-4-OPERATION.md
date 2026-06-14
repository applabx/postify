# Phase 4 — Production Hardening: Findings & Actions
# Audit date: 2026-06-14
# Status: READY TO IMPLEMENT

---

## Phase 4.1 — Replace ttl.sh with GHCR

### Current State
| Item | Value |
|---|---|
| Image | `ttl.sh/applabx/postify:latest` |
| Registry | ttl.sh (anonymous, ephemeral, 24h TTL) |
| Auth | None — anyone can push/pull |
| Tagging | `latest` only, no SHA |
| Retention | Auto-evicts after 24h if unused |
| GitHub Actions | `.github/workflows/release.yml` — **does not exist yet** |

### Risk
- `ttl.sh` is an ephemeral anonymous registry. If the image is garbage-collected (24h idle), `pull_policy: always` causes a deploy failure with no fallback.
- No SHA tagging means "latest" can silently change between deploys.
- No authentication — any GitHub Actions runner in any fork can pull/push the same image name.

### Solution: GHCR with versioned tags

**Created:** `.github/workflows/release.yml`

```
Registry:  ghcr.io/applabx/postify
Tags:      sha-{7-char-SHA}  (e.g. sha-24ee6d3)
           latest            (on master push only)
```

**Before deploying this workflow:**
1. Enable GHCR in the GitHub repo: **Settings → Packages → Enable anonymous access** (or private with `packages: write` token scope — the workflow above uses `GITHUB_TOKEN` which auto-grants `packages: write` for the repo).
2. The image will be `ghcr.io/applabx/postify:sha-24ee6d3` and `ghcr.io/applabx/postify:latest`.
3. Update `docker-compose.yaml` and Coolify's compose override:
   ```
   image: ghcr.io/applabx/postify:latest
   ```
   (the SHA tag is only needed for rollback; `latest` always points to the latest master push).

### Rollback
If a bad image is pushed:
```bash
# Re-tag the last known good SHA
docker pull ghcr.io/applabx/postify:sha-abc1234
docker tag ghcr.io/applabx/postify:sha-abc1234 ghcr.io/applabx/postify:latest
docker push ghcr.io/applabx/postify:latest
```
Then trigger a Coolify restart (API or UI).

---

## Phase 4.2 — GitHub → Coolify Continuous Deployment

### Current State
| Item | Value |
|---|---|
| GitHub App | Registered in Coolify (source_type: `App\Models\GithubApp`) |
| Source ID | `2` (but GET /sources/2 returns 404 — stale/detached) |
| Webhook | **BROKEN** — `is_webhook: false` on last deployment |
| Deploy trigger | Manual API call only (`POST /deploy` or `/start`) |
| git_commit_sha | `"HEAD"` (literal string, never updated) |
| Deployed SHA | `24ee6d31666d758bdcca62f6e2e6dd56b7f75851` ✅ correct |
| GitHub HEAD | `24ee6d31666d758bdcca62f6e2e6dd56b7f75851` ✅ in sync |

### Diagnosis
Coolify's GitHub App webhook is **disconnected**. Possible causes:
- GitHub App was uninstalled from the repo
- Coolify instance URL changed, invalidating the webhook callback
- GitHub App token expired and wasn't refreshed

Without the webhook, Coolify sees `git_commit_sha = "HEAD"` on every deploy, so `requires_build = false` and it **never rebuilds** even when new commits land. Currently the workflow is: push to GitHub → manually run `POST /api/v1/applications/{uuid}/start` → Docker pulls `ttl.sh:latest` which was last built from the latest commit. This is fragile and non-repeatable.

### Changes Required

#### Step 1 — Reconnect GitHub App (fixes the webhook)
1. Go to **Coolify → postify → Sources**
2. Click the GitHub source → "Disconnect" → then "Connect" → re-authorize the GitHub App for `applabx/postify`
3. Confirm: `is_webhook` flips to `true` on next deployment record

**Verification:**
```bash
curl -s -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/deployments?limit=1" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('is_webhook:', d[0]['is_webhook'])"
```

#### Step 2 — Remove the `git_full_url` null (enables SHA tracking)
After reconnecting the GitHub App, Coolify will populate `git_full_url`. Once non-null, it will also store the real `git_commit_sha` on each deploy, enabling:
- Change detection (new commit → auto-rebuild)
- One-click rollback to a previous SHA
- Accurate deployment history

#### Step 3 — Optional: API-based deploy trigger (if webhook is slow/unreliable)
Un-comment the `deploy-coolify` job in `.github/workflows/release.yml` and add `COOLIFY_API_KEY` as a GitHub Actions secret.

---

## Phase 4.3 — Remove Unsafe Prisma Workflow

### Files Found Using Unsafe Commands

| File | Command | Risk | In Production? |
|---|---|---|---|
| `deploy.sh` | `prisma db push --accept-data-loss` | **CRITICAL** — destructive schema overwrite, no rollback | ✅ **YES** |
| `start.sh` | `npx prisma db push` | **HIGH** — overwrites schema without migration history | Dev only |
| `package.json` | `"db:push": "prisma db push"` | MEDIUM — dev convenience script | Dev only |
| `package.json` | `"db:reset": "prisma db push --force-reset"` | **CRITICAL** — drops all data | Dev only |
| `prisma/seed.ts` | instructions to run `db push` | LOW — documentation only | N/A |
| `HANDOFF.md` | references `db push --accept-data-loss` | LOW — documentation | N/A |
| `AUTH-ROOT-CAUSE.md` | references `db push --accept-data-loss` | LOW — documentation | N/A |
| `DEPLOYMENT-CHECKLIST.md` | references `db push --accept-data-loss` | LOW — documentation | N/A |
| `AGENTS.md` | flags this as a known risk | LOW — documentation | N/A |
| `TODO.md` | flags this as a known risk | LOW — documentation | N/A |
| `NEXT_SESSION_HANDOFF.md` | references `db push` | LOW — documentation | N/A |
| `README.md` | references `db push` | LOW — documentation | N/A |

### Risk Assessment

**`deploy.sh` — CRITICAL**

This script is called by `npm run deploy` and is the canonical production deploy path. Running `prisma db push --accept-data-loss` in production means:
- Any schema change that requires a destructive migration (dropping a column, changing a type) runs silently without review
- No migration history in `_prisma_migrations` table — no rollback path
- If the deploy runs twice with different schema versions, data can be silently lost

**Mitigation already applied:** The deployed container uses a pre-built Docker image that already has the schema baked in. `deploy.sh` is **not called during a Coolify deploy** because Coolify just runs `docker compose up -d` — it doesn't execute shell scripts in the container.

**However:** if `deploy.sh` is ever run manually against the production Neon database (e.g., after a manual hotfix), the risk is real.

### Exact Change Required

Replace `deploy.sh:35`:
```bash
# BEFORE (UNSAFE)
npx prisma db push --accept-data-loss

# AFTER (SAFE — once migrations exist)
npx prisma migrate deploy
```

**Prerequisite:** Create an initial migration from the current schema:
```bash
npx prisma migrate dev --name init
# Review the generated migration file
npx prisma migrate deploy  # apply to Neon
```

Since the schema is already applied to Neon (via `$executeRawUnsafe`), the first proper migration is a no-op baseline.

---

## Phase 4.4 — Environment & Secret Backup

### All Runtime Variables

| Variable | Source | In Git? | Regeneratable? | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | Neon managed DB | `.env` (Coolify) | **No** — Neon generates | `postgres://postgres:***@mokffvpqs75w6cg3ixyxxzuq:5432/postify` |
| `REDIS_URL` | Redis managed DB | `.env` (Coolify) | **No** — managed | `redis://default:***@xxe3cwi6zi2y7o21xtg09xrk:6379/0` |
| `NEXTAUTH_SECRET` | Random 32+ bytes | `.env` (Coolify) | **Yes** | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | Random 32+ bytes | `.env` (Coolify) | **Yes** | `openssl rand -base64 32` |
| `CRON_SECRET` | Random 32+ bytes | `.env` (Coolify) | **Yes** | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Domain | Static | **No** | `https://postify.applabx.com` |
| `NEXT_PUBLIC_APP_URL` | Domain | Static | **No** | `https://postify.applabx.com` |
| `ENABLE_DEV_AUTH` | Feature flag | `docker-compose.yaml` | N/A | `false` (production) |
| `NEXT_PUBLIC_ENABLE_DEV_AUTH` | Feature flag | `.env` (Coolify) | N/A | `true` (client-readable!) |
| `AUTH_USE_PRISMA_ADAPTER` | Feature flag | `docker-compose.yaml` | N/A | `false` |
| `DEBUG_AUTH_TEST` | Debug string | `.env` (Coolify) | N/A | `hello_from_env` |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth App | `.env` (Coolify) | **No** | LinkedIn portal |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth App | `.env` (Coolify) | **No** | LinkedIn portal |
| `HOST` | Static | `docker-compose.yaml` | N/A | `0.0.0.0` |
| `NODE_ENV` | Static | `docker-compose.yaml` | N/A | `production` |
| `SOURCE_COMMIT` | CI/CD | `.env` (Coolify) | Auto | Auto-injected by CI |
| `COOLIFY_*` vars | Coolify | Auto | N/A | Injected by Coolify at runtime |

### Critical: `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` is exposed to the client
`NEXT_PUBLIC_*` vars are bundled into the client-side JavaScript. `NEXT_PUBLIC_ENABLE_DEV_AUTH=true` is readable by anyone who opens DevTools. This is a minor information disclosure — it reveals the dev bypass exists, but the actual password is still server-side only.

**Recommendation:** Change `NEXT_PUBLIC_ENABLE_DEV_AUTH` to `false` in `.env` (or remove it entirely) — the client-side code should default to `false` anyway.

### Secret Regeneration Procedures

```bash
# Generate new NEXTAUTH_SECRET
openssl rand -base64 32

# Generate new TOKEN_ENCRYPTION_KEY
openssl rand -base64 32

# Generate new CRON_SECRET
openssl rand -base64 32
```

⚠️ **Regenerating any secret invalidates all active sessions and encrypted tokens.** Requires coordinated restart.

### Recovery Procedure (New Server)
1. Install Coolify on new host
2. Add source: connect GitHub App to `applabx/postify`
3. Create environment variables in Coolify dashboard (all vars above)
4. Coolify pulls `ghcr.io/applabx/postify:latest` and starts containers
5. Run `npx prisma migrate deploy` from within container
6. Verify: `curl https://postify.applabx.com/api/health`
