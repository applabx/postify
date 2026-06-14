# AGENTS.md

This is the source of truth for AI agents working in this folder. Keep it concise, current, and grounded in the actual codebase.

## Product

Postify is a self-hosted social media publisher. The intended workflow is: connect social accounts, compose one post, select multiple destinations, publish now or schedule, then review per-platform results.

Current target platforms are LinkedIn, Facebook, Instagram, X/Twitter, Threads, Bluesky, Pinterest, and Tumblr.

## Architecture

- App: Next.js App Router application in `app/`.
- API: Next route handlers in `app/api/`.
- Auth: NextAuth v4 config in `lib/auth.ts`.
- Data: PostgreSQL through Prisma, schema in `prisma/schema.prisma`.
- Publishing: `app/api/posts/route.ts` creates `Post` and `PostTarget` rows, then calls `lib/publisher.ts`.
- Scheduling: `lib/scheduler.ts` uses `bull` v4 and Redis. The processor currently runs in the web process when the module is loaded.
- OAuth/platform code: `lib/oauth/linkedin.ts`, `lib/oauth/meta.ts`, and `lib/oauth/platforms.ts`.
- Secrets: token encryption/decryption helpers are in `lib/secrets.ts`.
- Uploads: `app/api/upload/route.ts` signs and proxies uploads to Cloudinary.
- Middleware/proxy: `proxy.ts` protects non-public routes with NextAuth.

Core Prisma models:

- `User`
- `SocialAccount`
- `Post`
- `PostTarget`
- `ScheduledJob`

## Tech Stack

- Next.js `16.2.2`
- React `19.2.4`
- TypeScript
- Prisma `5.22.0`
- PostgreSQL
- Redis
- `bull` `4.16.5`
- NextAuth `4.24.13`
- Cloudinary upload API
- Docker Compose
- PM2/Nginx direct-server deployment

## Run, Test, Deploy

Node must satisfy `>=20.9.0`.

Local:

```bash
npm run check:node
npm run up
```

`npm run up` defaults to Dockerized app/db/Redis through `start.sh`. For host Next.js with Docker db/Redis:

```bash
npm run up:local
```

Useful commands:

```bash
npm run lint:gate
npm run build
npx next build --webpack
npm run db:push
npm run db:seed
npm run db:studio
```

Important local caveat: on this Mac, plain `npm run build` has failed because Next tries Turbopack and native SWC/Prisma binaries can hit code-signature loading errors. `npx next build --webpack` is the currently verified local build path.

CI:

- `.github/workflows/ci.yml` runs `npm ci`, `npm run lint:gate`, and `npm run build` on Node `20.11.1`.

Deployment:

- PM2/direct server: `deploy.sh`, `ecosystem.config.js`, `nginx.conf.example`.
- Docker Compose: `Dockerfile`, `docker-compose.yml`.

Do not treat `deploy.sh` as production-safe until `prisma db push --accept-data-loss` is replaced with migrations.

## Important Directories and Files

- `app/compose/page.tsx`: main compose, media, platform selection, preview, publish/schedule UI.
- `app/accounts/page.tsx`: connected account management and platform connection entry points.
- `app/history/page.tsx`: published post history.
- `app/queue/page.tsx`: scheduled post queue.
- `app/analytics/page.tsx`: basic analytics UI.
- `app/api/accounts/`: account list/delete API.
- `app/api/posts/`: publish, list, detail, cancel scheduled posts.
- `app/api/oauth/`: OAuth start/callback/save routes.
- `app/api/upload/route.ts`: Cloudinary upload proxy.
- `lib/publisher.ts`: routes each `PostTarget` to platform publisher.
- `lib/scheduler.ts`: Bull queue setup and scheduled publish processing.
- `lib/platforms.ts`: platform limits and capabilities used by the UI.
- `lib/env.ts`: required env validation.
- `lib/auth.ts`: NextAuth options.
- `prisma/schema.prisma`: database schema.
- `.env.example`: env template. Never expose `.env` values.

## Coding Conventions

- Prefer the existing App Router and route-handler structure.
- Keep server-only code in API routes or `lib/*`; do not leak tokens to client components.
- Use Prisma for data access; avoid ad hoc SQL unless explicitly approved.
- Store platform behavior in `lib/platforms.ts` when it affects UI validation.
- Validate publish inputs before creating jobs or calling platform APIs.
- Preserve per-target results; each platform publish should update its own `PostTarget`.
- Keep UI dense and workflow-oriented. This is an operator tool, not a marketing page.
- Avoid new dependencies unless they remove real complexity.
- Do not introduce broad refactors while fixing one platform or route.
- Keep docs current: update `TODO.md` and `HANDOFF.md` before ending every coding session.

## Systems Requiring Approval Before Modification

- `.env`, secrets, OAuth credentials, and token handling.
- `prisma/schema.prisma` and any production migration strategy.
- `deploy.sh`, `Dockerfile`, `docker-compose.yml`, `ecosystem.config.js`, and `nginx.conf.example`.
- Auth behavior in `lib/auth.ts` and `proxy.ts`.
- Token encryption/decryption in `lib/secrets.ts`.
- Publishing side effects in `lib/publisher.ts` and platform API calls under `lib/oauth/`.
- Scheduler/queue behavior in `lib/scheduler.ts`.
- CI behavior in `.github/workflows/ci.yml`.

## Postify Coolify Deployment

- Coolify project UUID: `zkn0b8z7ubb4a59mlv8pmfdc` ("Postify")
- App UUID: `eehzi4dz98bay175wko3wqut`
- GitHub repo: `https://github.com/applabx/postify` (master branch)
- Source GitHub App: `vo1crbnhartzt5pofv1ypu7s` (applabx)
- Domain: `https://postify.applabx.com` (Traefik labels in compose, DNS A record pointing to server IP)
- Managed PostgreSQL: `mokffvpqs75w6cg3ixyxxzuq`
- Managed Redis: `xxe3cwi6zi2y7o21xtg09xrk`
- Current deployed image: `ttl.sh/applabx/postify:latest` (GHCR migration in progress — see `release.yml`)
- Container IDs change on every restart; always find current with `docker ps | grep "app-eehzi4dz98bay175wko3wqut-"`

### ⚠️ Critical: Coolify env vars are in Coolify's DB, NOT the .env file

Coolify reads env vars from its internal database and injects them as `--env` flags into containers.
The `.env` file at `/data/coolify/applications/eehzi4dz98bay175wko3wqut/.env` is overwritten by Coolify on
restart. **Never edit that .env file directly** — changes are lost on next restart.

To change an env var, **use the Coolify UI only**. Coolify regenerates the docker-compose.yaml
on every restart from its internal database. Filesystem edits to compose or .env are wiped.

**Coolify UI path:** Coolify → postify → Environment → click the variable → Edit → Save → restart

**API note:** `GET /api/v1/applications/{uuid}/envs` returns metadata but redacts values.
Known working env UUIDs (prod environment `k13dx34n1a9hj8c3957udaoh`):
- `ENABLE_DEV_AUTH`: `wyyem7n5wo0phy146i160t7i`
- `NEXT_PUBLIC_ENABLE_DEV_AUTH`: `coonnk8tcqwcso8xqb241dtl`
- `DATABASE_URL`: `mr04rr6yilgw17jr2t5vo6tv`

Known live env vars in Coolify DB (currently wrong):
| Key | Coolify DB Value | Should Be |
|---|---|---|
| `ENABLE_DEV_AUTH` | `true` ❌ | `false` |
| `NEXT_PUBLIC_ENABLE_DEV_AUTH` | `true` ❌ | `false` |
| `DATABASE_URL` | `.../postgres` ❌ | `.../postify` |
| `SOURCE_COMMIT` | `cceb9b5e...` | (auto) |

### ⚠️ Active Production Issues (Phase 4-7 audit, 2026-06-14)

1. **Coolify GitHub webhook disconnected** — `is_webhook: false` on every deployment.
   Coolify doesn't receive push events from GitHub. Fix: Coolify UI → Sources → reconnect GitHub App.
   Until fixed: manual `POST /api/v1/applications/{uuid}/start` to trigger deploy after push.

2. **`git_commit_sha = "HEAD"` literal string** — Coolify can't detect new commits.
   Caused by broken webhook above. Result: `requires_build` is always false; Coolify never
   rebuilds even when source changes.

3. **Redis has no persistence** — BullMQ scheduled jobs are RAM-only.
   `redis_data` volume is not backed up. Redis crash = all scheduled jobs lost.
   Fix: add `command: redis-server --appendonly yes` to redis service.

4. **No app-level health endpoint** — `/api/health` returns 403 (Traefik → auth redirect).
   External uptime monitors can't distinguish app crash from infrastructure issue.

5. **No migration history** — schema applied via `$executeRawUnsafe`, no `_prisma_migrations` entries.
   `prisma migrate deploy` will fail on existing DB; `deploy.sh` still has `db push --accept-data-loss`.

6. **`NEXT_PUBLIC_ENABLE_DEV_AUTH=true` in container** — exposed in client-side JS bundle.
   Reveals dev bypass exists. Set to `false` in Coolify `.env`.

### Coolify env var gotcha
When setting runtime env vars via `PATCH /applications/{uuid}/envs/bulk`, you MUST include `"is_buildtime": false` AND `"is_runtime": true`. If `is_runtime` is missing, the var only applies at build time. This caused NEXTAUTH_SECRET, AUTH_USE_PRISMA_ADAPTER, and ENABLE_DEV_AUTH to silently not work.

### Dev auth
For local/dev testing without Google OAuth: set `ENABLE_DEV_AUTH=true` + `AUTH_USE_PRISMA_ADAPTER=false` (so auth bypasses DB). Also set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the production URL (not the auto-generated sslip.io one).

## Current Operational Notes

- `.github/workflows/release.yml` added (GHCR workflow) — needs push via `gh api` or PAT with `workflow` scope.
- Production auth confirmed working: `ENABLE_DEV_AUTH=false`, real Google auth (dev credentials).
- Full ops docs: `PRODUCTION_SUMMARY.md`, `PHASE-4-OPERATION.md`, `PHASE-5-7-OPERATION.md`.
- Scheduling runs in web process (Bull processor imported at module load); see `lib/scheduler.ts`.
- Coolify owns `docker-compose.yaml` at `/data/coolify/applications/eehzi4dz98bay175wko3wqut/docker-compose.yaml` — do not edit the one in GitHub directly.
- `.env` is gitignored but committed in git history of older repos; always check `git log --all --full-history -- **/.env` before assuming a file is clean.
