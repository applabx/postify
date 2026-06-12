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

## Current Operational Notes

- This folder currently is not a Git repository according to `git status`.
- Current `.env` contains the required key names, including `TOKEN_ENCRYPTION_KEY`, but values were not inspected.
- Google login is documented, but active auth is still dev credentials-driven.
- Scheduling is fragile until Bull processing is moved out of the web process.
- README and older handoff notes can drift; verify against live files before acting.
