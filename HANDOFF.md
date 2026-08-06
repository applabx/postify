# HANDOFF.md

Update this file before ending every coding session.

## Current Repository Status

- Branch: master; origin at `c21d6c5` (RC4 SaaS-readiness head)
- **RC4 complete**: worker architecture, metrics, Sentry, immutable-deploy tooling, soak/chaos — see `QA/Phase-10-RC4-SaaS-Readiness-Report.md`
- **GitHub Actions was in MAJOR OUTAGE** (2026-08-06 ~19:30 UTC, githubstatus.com) — pushes `702bcb1`/`46dd494`/`c21d6c5` did NOT create CI/Release runs. Manual `workflow_dispatch` of Release worked (run `31126881965`) and failed at the Docker build (`.dockerignore` excluded `scripts/` → fixed in `c21d6c5`). On outage recovery: re-run `gh workflow run release.yml --ref master` and verify the full chain.

## Session Summary: RC4 — Platform Scale & SaaS Readiness (2026-08-06)

- **Worker architecture**: `lib/worker.ts` (heartbeats w/ version+jobsProcessed+RSS, graceful SIGTERM drain→close→exit 0, crash capture), `worker/index.ts` + esbuild bundle shipped in the image, `PUBLISH_WORKER=true|false|unset(legacy)` gating; multi-worker verified (2 workers, 40 jobs, 0 dupes).
- **Metrics**: `/api/metrics` (prom-client) — publish/queue/worker/OAuth/API/process/redis/pg; `middleware.ts` whitelists it; `docs/GRAFANA.md`.
- **Sentry**: `lib/sentry.ts` + client boundary; scrubs PII; captures oauth/publish/queue/token-refresh/worker crashes. Set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` in prod.
- **Immutable deploys**: `health.image` (CONTAINER_IMAGE), `scripts/pin-coolify-digest.sh`, smoke test digest assertion (`PROD_REQUIRE_DIGEST`).
- **OAuth harness**: `tests/oauth-certification.test.ts` (27 total tests), `docs/OAUTH_CERTIFICATION.md`.
- **Soak/chaos evidence**: 240 publishes 0 dupes; RSS 90→94MB; SIGTERM exit 0 in 531ms; SIGKILL → orphan never republished; redis-restart 20/20; postgres-restart 19/20+orphan+queue-recovery; 200-burst; 2-worker.
- **Findings fixed**: lint-gate 1MB maxBuffer; `.dockerignore` excluded scripts; worker heartbeat lazyConnect race; Bull removeOnComplete caps counters (drain via DB); scheduler attempts 3→5.
- Production still runs legacy mode (web processes jobs) until the operator adds the worker container (docs/OPERATIONS.md §1).

## Session Summary: CI/CD Recovery (2026-08-06, still in force)

- Push identity: `gh auth switch --user applabx` before `git push` (active account resets to `investvietnamofficial` between sessions).
- Cloudflare bot-challenges GitHub runner egress — smoke tests fall back to direct origin `--resolve postify.applabx.com:443:178.105.157.205`.
- Never embed multi-line python in workflow YAML — use `scripts/*.py`.
- Full detail: `QA/Phase-9-CICD-Recovery-Report.md`.

## Session Summary: Workflow Verification & Production Hardening (2026-07-29)

### Previous Audit Findings Verification

All 10 P0 fixes from the previous session were verified as correct. Additionally found and fixed:
- `mediaTypes` not passed to `publishToTarget`, breaking Instagram video detection
- Bluesky connect never sets `tokenExpiry`, so refresh cron never catches it
- Upload route accepts client-controlled MIME type with no magic byte validation
- `ensureSessionUser` duplicated across 5 files

### Bugs Fixed This Session

**P0 — Critical (2 fixed):**
1. **Instagram video detection broken** — `publishToTarget` was called without `post.mediaTypes`; `(acc as any).mediaTypes?.[0]` always returned `undefined`. Fixed: pass `mediaTypes` through `publishToTarget`, use `mediaTypes[0]` for Instagram media type detection.

2. **Bluesky token refresh never triggers** — Bluesky connect never set `tokenExpiry` (null), so `token-refresh.ts` cron query (`tokenExpiry: { lte: sevenDaysFromNow }`) excluded Bluesky accounts. Added `tokenExpiry: new Date(Date.now() + 2h)` to Bluesky connect route.

**P1 — High (2 fixed):**
3. **Upload magic-byte validation missing** — Added magic byte header detection for JPEG/PNG/GIF/WebP/MP4/MOV. Falls back to validation if bytes don't match known signatures.

4. **`ensureSessionUser` duplicated across 5 files** — Extracted to `lib/session-user.ts`. Replaced in linkedin/callback, linkedin/save, meta/callback, meta/save.

**P2 — Medium (2 fixed):**
5. **Duplicate `@auth/prisma-adapter` package** — Removed unused `@auth/prisma-adapter` from `package.json`.

6. **No CSP header** — Added `Content-Security-Policy` with restrictive defaults in `next.config.ts`.

### Workflow Certification

#### Authentication
| Workflow | Status | Evidence |
|---|---|---|
| Login | PASS | Code path verified: `lib/auth.ts` → credentials provider with bcrypt + rate limiting |
| Logout | PASS | `signOut({ callbackUrl: '/login' })` in `sidebar-nav.tsx:67` |
| Session | PASS | JWT sessions via NextAuth, `session.user.id` available in all API routes |
| Middleware | PASS | `middleware.ts` named correctly, exported as `middleware`, matcher excludes public paths. Build output: "ƒ Proxy (Middleware)" |
| CSRF (register) | PASS | Double-submit cookie pattern in `/api/auth/register` |
| CSRF (API) | NOT TESTED | API routes lack CSRF; mitigated by SameSite=Lax cookies |

#### Accounts
| Workflow | Status | Evidence |
|---|---|---|
| LinkedIn OAuth | PASS | Auth URL + callback + temp store + save route all verified |
| Facebook OAuth | PASS | Auth URL + callback + temp store + save route all verified |
| Instagram OAuth | PASS | Fetched via Facebook pages, temp-stored, saved with pageToken |
| Bluesky connect | PASS | Handle + app password → AT Protocol auth → encrypted JWT storage |
| Pinterest OAuth | PASS | Auth URL + callback + temp store + save route all verified |
| Tumblr OAuth | PASS | OAuth 1.0a request token (signature fixed), callback, temp store, save |
| Token storage | PASS | All tokens encrypted via `encryptSecret()` before DB storage |
| Token refresh | PASS | Cron handler at `/api/cron/refresh-tokens` handles all 6 platforms |
| Expired recovery | PASS | Cron marks expired tokens, UI shows "Token expired — reconnect" |
| Disconnect | PASS | `DELETE /api/accounts/[id]` sets `isActive: false` |

#### Composer
| Workflow | Status | Evidence |
|---|---|---|
| Create post | PASS | `POST /api/posts` with Zod validation, account ownership check |
| Upload images | PASS | Cloudinary proxy with magic byte validation + signature verification |
| Upload video | PASS | Same as images; `detectMediaType` correctly tags as 'video' |
| Multiple images | PASS | Array of URLs, up to 10 (Zod validation) |
| Schedule picker | PASS | Date/time inputs, validated as future datetime, HCM timezone |
| Character limits | PASS | Per-platform limits from `lib/platforms.ts` |
| Readiness checks | PASS | Media required platforms (Instagram, Pinterest), expired tokens, char limits |

#### Publishing
| Workflow | Status | Evidence |
|---|---|---|
| Publish immediately | PASS | Creates Post → PostTargets → `publishPost()` → `Promise.allSettled` |
| Publish scheduled | PASS | Creates Post (SCHEDULED) + ScheduledJob + Bull delayed job |
| Queue creation | PASS | Bull queue `postify:publish` with Redis, eager processor registration |
| Retry failures | PASS | 3 attempts with exponential backoff (Bull `defaultJobOptions`) |
| Status updates | PASS | PENDING → PUBLISHING → PUBLISHED/PARTIAL/FAILED per target + post |
| Partial results | PASS | Per-target SUCCESS/FAILED stored with externalPostId/errorMessage |

#### BullMQ
| Workflow | Status | Evidence |
|---|---|---|
| Queue created | PASS | `new Bull('postify:publish', { redis: ... })` at module init |
| Worker registered | PASS | Eager `getPublishQueue()` at module load, guarded against build phase |
| Server restart | PASS | Bull stores jobs in Redis; processor re-registered on restart |
| Failed job retry | PASS | `attempts: 3, backoff: { type: 'exponential', delay: 5000 }` |
| Redis reconnect | INHERENT | Bull uses ioredis which handles reconnection; no custom reconnect logic |

#### Database (Prisma)
| Workflow | Status | Evidence |
|---|---|---|
| User model | PASS | Schema: User, SocialAccount, Post, PostTarget, ScheduledJob |
| Connected accounts | PASS | SocialAccount with platform enum, encrypted tokens, expiry |
| Posts | PASS | Post with status, mediaUrls, targets |
| Schedules | PASS | ScheduledJob with bullJobId, runAt |
| History | PASS | PostTarget status tracking per destination |

#### Deployment
| Workflow | Status | Evidence |
|---|---|---|
| Docker build | PASS | `Dockerfile` multi-stage, `npx next build --webpack` verified |
| Docker Compose | PASS | db (Postgres 16), redis (7), app (GHCR image) |
| Coolify | PASS | env vars managed via Coolify DB, compose labels for Traefik |
| Health endpoint | PASS | `GET /api/health` returns `{ status: "ok", timestamp }`, public (in middleware exclude list) |
| CI | PASS | `.github/workflows/ci.yml` runs lint gate + build on Node 20.11.1 |

### Tests Performed

| Test | Result |
|---|---|
| `npx next build --webpack` | PASS (all routes compile, middleware detected) |
| `npm run lint:gate` | PASS (28/29 warnings, within baseline) |
| `npm install --legacy-peer-deps` | PASS (unused `@auth/prisma-adapter` removed) |
| Code path verification | All 6 OAuth flows verified for state validation, temp store, token encryption |
| Auth middleware matcher | Verified regex correctly excludes public paths |
| Bull eager init guard | Verified `NEXT_PHASE !== 'phase-production-build'` prevents build-time init |
| Magic byte validation | 7 file types with known magic signatures verified |

### Remaining Issues

**P1 — High:**
- Rate limiting is in-memory only (resets on restart) — acceptable for single-instance
- No scheduled job recovery if Redis is wiped — persistent risk

**P2 — Medium:**
- `validateEnv()` is dead code (never imported anywhere)
- History pagination lacks total count metadata
- Analytics `Promise.all` — partial failures not handled
- Sidebar not responsive (fixed 200px)
- No dark mode support
- README references Next.js 14 and Supabase (outdated)

**P3 — Low:**
- Missing `alt` text on profile images
- No toast dismiss on accounts page

### Risks

1. **`prisma db push --accept-data-loss`** — Unsafe for production. Must replace with proper migrations.
2. **Redis no persistence** — `docker-compose.yml` Redis has no `appendonly yes`. Crash = all scheduled jobs lost.
3. **Bull jobs in web process** — Runs inside Next.js web process, not a dedicated worker. If the container runs out of memory or restarts during a publish, job state could be inconsistent.
4. **Facebook page tokens assumption** — Refreshing user token doesn't update `pageToken`; assumed that page tokens remain valid independently.

### Production Readiness: ~65%

Security is now solid (auth middleware active, tokens encrypted at rest + never in URLs, CSP header, magic byte validation, rate limiting). The two remaining production blockers are: (1) replacing `db push --accept-data-loss` with migrations, and (2) Redis persistence config. These are infrastructure changes (not code changes) that must be addressed before declaring production-ready.

### Recommended Next Session

1. Replace `prisma db push` with proper migrations in deploy.sh and Dockerfile
2. Add `command: redis-server --appendonly yes` to docker-compose.yml Redis service
3. Update README to reflect Next.js 16, React 19, middleware.ts, and remove Supabase references
