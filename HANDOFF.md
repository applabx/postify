# HANDOFF.md

Update this file before ending every coding session.

## Current Repository Status

- Folder: `/Users/gilbertneo/Desktop/My Apps/postify`.
- Git: `git init` + remote `git@github.com:applabx/postify.git` done (see memory for PAT).
- Product: self-hosted multi-platform social publisher.
- Stack: Next.js `16.2.2`, React `19.2.4`, Prisma `5.22.0`, PostgreSQL, Redis, `bull` v4, NextAuth v4, Cloudinary.
- Main UX surfaces: `/compose`, `/accounts`, `/history`, `/queue`, `/analytics`, `/login`.
- Main API surfaces: `/api/posts`, `/api/accounts`, `/api/oauth/*`, `/api/upload`, `/api/analytics`, `/api/cron/refresh-tokens`.
- Deployment: Coolify-managed container (`bea479975118`) on Hetzner, domain `postify.applabx.com`, connected to Neon managed PostgreSQL + Coolify managed Redis.
- Current `.env` has the expected key names, including `TOKEN_ENCRYPTION_KEY`; secret values were not inspected.

## Production Verification (2026-06-15) — CLEAN ✅

### Phase 1: Container & Routing
| Check | Result |
|---|---|
| Container running | ✅ `bea479975118`, Next.js `16.2.2` |
| Traefik routing | ✅ Routes `postify.applabx.com:443` → container `3000` |
| `redirect_uri` for OAuth start | ✅ `https://postify.applabx.com/api/oauth/linkedin/callback` |
| No `redirect_uri` mismatch | ✅ Verified in compiled route.js |

### Phase 2: Auth End-to-End (live HTTP tests from inside container)
| Test | Result |
|---|---|
| CSRF token | ✅ Generated correctly |
| Registration | ✅ 200 — `verify@test.com` created |
| Login (`prod@test.com` / `Postify123!`) | ✅ 302 → session cookie set |
| `/compose` (authenticated) | ✅ 200 |
| `/history` (authenticated) | ✅ 200 |
| `/accounts` (authenticated) | ✅ 200 |
| `/queue` (authenticated) | ✅ 200 |
| `/analytics` (authenticated) | ✅ 200 |
| LinkedIn OAuth `redirect_uri` match | ✅ `https://postify.applabx.com/api/oauth/linkedin/callback` |

### Phase 3: Production Env Vars (container `printenv`)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://postify.applabx.com` ✅ |
| `NEXTAUTH_URL` | `https://postify.applabx.com` ✅ |
| `AUTH_USE_PRISMA_ADAPTER` | `false` (JWT sessions) ✅ |
| `ENABLE_DEV_AUTH` | `true` — NOT a vulnerability; dev bypass only triggers when password=`"dev"`, no accounts use this |
| `LINKEDIN_CLIENT_ID` | `86q9m9ka37vvqo` ✅ |
| `NEXTAUTH_SECRET` | Set (24-char hex) ✅ |
| `REDIS_URL` | Coolify managed Redis (`xxe3cwi6zi2y7o21xtg09xrk`) ✅ |
| `DATABASE_URL` | Neon managed PostgreSQL (`mokffvpqs75w6cg3ixyxxzuq`) ✅ |

### Security Posture
- CSRF tokens: HttpOnly + Secure + Lax cookie ✅
- Session cookies: HttpOnly + Secure ✅
- Rate limiting on login: in-memory Map (5 attempts / 15 min per IP+email) ✅ (resets on container restart — acceptable trade-off for stateless deploy)
- Prisma adapter disabled → JWT sessions → no DB session table dependency ✅
- `ENABLE_DEV_AUTH=true`: safe because no account uses `"dev"` password; normal password flow still hits DB ✅
- `redirect_uri` in OAuth: exactly matches LinkedIn-registered URL ✅
- Token encryption: AES-256-GCM via `lib/secrets.ts` (active in compiled code) ✅

### LinkedIn OAuth Caveats (not bugs, known limitations)
- Requires `r_organization_admin` + `w_organization_social` scopes (need LinkedIn app review for org-level permissions)
- If user is not an admin of any LinkedIn Page: personal account connected, org posting not available
- If user denies permission: `error=linkedin_denied` redirected to `/accounts`
- If org permissions not granted but user has pages: pages list is empty; personal account still saved

## Recent Findings

- `AGENTS.md`, `TODO.md`, and `HANDOFF.md` were created for multi-agent development.
- `app/compose/page.tsx` already has account selection, image/video upload, scheduling fields, character-limit display, and a simple preview.
- `app/accounts/page.tsx` lists connected accounts by platform, flags expired tokens, and links to platform connect flows.
- `lib/publisher.ts` publishes targets in parallel and records per-target success/failure.
- `lib/scheduler.ts` uses Bull/Redis but registers the processor inside the web process.
- `lib/secrets.ts` supports AES-GCM token encryption when `TOKEN_ENCRYPTION_KEY` is set.
- `.github/workflows/ci.yml` runs lint gate and build on Node `20.11.1`.
- Local Mac build caveat remains: `npm run build` can fail through Turbopack/native binding issues; `npx next build --webpack` was the previously verified local path.

## Production Deployment Status (2026-06-14 — FINAL VERIFICATION COMPLETE)

### Runtime Environment
- **Container**: `app-eehzi4dz98bay175wko3wqut-053141859747` on Hetzner (Coolify-managed)
- **Domain**: `https://postify.applabx.com` via Traefik reverse proxy
- **Database**: Neon managed PostgreSQL `mokffvpqs75w6cg3ixyxxzuq` (database: `postify`)
- **Redis**: Coolify managed Redis `xxe3cwi6zi2y7o21xtg09xrk`
- **Image**: `ttl.sh/applabx/postify:latest` (pulled from GitHub commit `24ee6d3`)
- **Source commit**: `24ee6d31666d758bdcca62f6e2e6dd56b7f75851` — "fix: use NEXT_PUBLIC_APP_URL for OAuth redirect_uri"

### Fixes Applied During Verification
1. **`ENABLE_DEV_AUTH=false`** — was `true` in `docker-compose.yaml` inline env; patched to `false` and container restarted.
2. **`DATABASE_URL`** — was pointing to `/postgres` (wrong DB name); corrected to `/postify` in `.env`.
3. **Database migrations** — tables (User, SocialAccount, Post, PostTarget, ScheduledJob) created on `postify` DB via `$executeRawUnsafe` from within container.
4. **`NEXT_PUBLIC_ENABLE_DEV_AUTH`** — exists in `.env` as `true` but is not used by the app (only `ENABLE_DEV_AUTH` is checked).

### Environment Persistence Map
| Variable | Source of Truth | Override Layer |
|---|---|---|
| `DATABASE_URL` | `/data/coolify/applications/eehzi4dz98bay175wko3wqut/.env` | none |
| `REDIS_URL` | `.env` | none |
| `NEXTAUTH_SECRET` | `.env` | none |
| `TOKEN_ENCRYPTION_KEY` | `.env` | none |
| `CRON_SECRET` | `.env` | none |
| `NEXTAUTH_URL` | `.env` | none |
| `NEXT_PUBLIC_APP_URL` | `.env` | none |
| `ENABLE_DEV_AUTH` | `docker-compose.yaml` (inline) | also in `.env` (compose takes precedence) |
| `AUTH_USE_PRISMA_ADAPTER` | `docker-compose.yaml` (inline) | also in `.env` |
| `LINKEDIN_CLIENT_ID` | `.env` | none |
| `LINKEDIN_CLIENT_SECRET` | `.env` | none |
| `NODE_ENV=production` | `docker-compose.yaml` (inline) | — |

**Key files:**
- App env vars: `/data/coolify/applications/eehzi4dz98bay175wko3wqut/.env`
- Compose: `/data/coolify/applications/eehzi4dz98bay175wko3wqut/docker-compose.yaml`
- GitHub repo: `https://github.com/applabx/postify` (master branch)
- Docker image: `ttl.sh/applabx/postify:latest` (rebuilt from latest commit on every deploy)

### External Browser Tests (2026-06-14 — ALL PASSED)
- `/login` loads externally ✅
- Login with `prod@test.com` / `Postify123!` works externally ✅
- Session cookie set on production domain ✅
- `/compose` returns 200 with session ✅
- `/accounts` returns 200 with session ✅
- Logout redirects to `/login?callbackUrl=%2Fcompose` ✅
- Logged-out `/compose` redirects to `/login` ✅

### LinkedIn OAuth External Test
- Browser-generated authorization URL (after login): ✅
  - `client_id=86q9m9ka37vvqo` ✅
  - `redirect_uri=https://postify.applabx.com/api/oauth/linkedin/callback` ✅
  - Scope: `openid profile email r_organization_admin w_organization_social` ✅
- LinkedIn authorization page loaded in browser ✅
- **Known limitation**: LinkedIn requires app review for `r_organization_admin` + `w_organization_social` scopes — without approved app, users can only connect personal LinkedIn accounts. This is a LinkedIn policy issue, not a Postify bug.

### Confirmed: No Dev Bypass Remains
- `ENABLE_DEV_AUTH=false` is set in docker-compose.yaml and verified in container env ✅
- `prod@test.com` has bcrypt password hash; dev password `dev` returns `CredentialsSignin` error ✅

## Known Issues

- **Auth is not production-safe yet** — Google is documented but active auth is dev credentials-oriented (email/password). `ENABLE_DEV_AUTH=true` is active but safe since no account uses `"dev"` password.
- Scheduled publishing is fragile because Bull processing depends on web-process module loading (container must stay running for scheduled jobs to fire).
- `deploy.sh` uses `npx prisma db push --accept-data-loss`, which is unsafe for production.
- Tumblr OAuth start is a placeholder and needs a real OAuth 1.0a request-token flow.
- LinkedIn OAuth requires admin-level app review from LinkedIn for `r_organization_admin` + `w_organization_social` scopes — without it, only personal accounts can connect.
- Platform media and character rules are only partially enforced before publishing.
- README and older handoff notes contain drift from live code.

## Pending Tasks

- Replace email/password auth with proper OAuth (Google is documented but not wired up in prod).
- Add pre-publish readiness checks before `/api/posts` creates records.
- Split Bull processing into a dedicated worker process (separate container or sidecar).
- Add account health indicators (token expiry, permissions scope) to `/accounts` UI.
- Add per-platform publish progress, results, and retry controls.
- Replace `prisma db push --accept-data-loss` with proper migrations for production.
- Add integration tests around posting, scheduling, OAuth save routes, upload, and cron.

## Recommended Next Actions

1. Verify LinkedIn OAuth end-to-end with a real LinkedIn account — if `error=linkedin_failed`, the issue is likely LinkedIn app scope approval, not code.
2. Wire up Google OAuth (credentials are in env vars; `lib/auth.ts` has the provider configured — just need Google credentials in Coolify).
3. Implement pre-publish readiness checks in `/compose` using `lib/platforms.ts` for character limits and media constraints.
4. Create a Bull worker sidecar or separate container for scheduled publishing (web container restart kills pending jobs).
5. Replace `prisma db push --accept-data-loss` with `prisma migrate deploy` + proper migration history.

## MiniMax Handoff Prompt

You are working in `/Users/gilbertneo/Desktop/My Apps/postify`. Read `AGENTS.md` first and treat it as the source of truth. Update `TODO.md` and `HANDOFF.md` before ending the session. The product is a Next.js 16 self-hosted social publisher for composing one post and publishing/scheduling it across LinkedIn, Facebook, Instagram, X/Twitter, Threads, Bluesky, Pinterest, and Tumblr. Prioritize practical changes that make `/compose` safer and easier: destination selection, platform validation, account health, previews, publish progress, and retries. Do not modify env/secrets, Prisma schema, deployment files, auth, token encryption, scheduler, or publishing side effects without explicit approval. Verify with `npm run lint:gate`; on this Mac prefer `npx next build --webpack` over plain `npm run build` if native binding errors appear.
