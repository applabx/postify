# Postify Next Session Handoff

## Current Architecture

Postify is a Next.js 16 App Router app with server-rendered API routes and client-side product pages for composing, scheduling, account connection, history, queue, analytics, and login.

- UI: `app/*` pages, mostly inline React style objects. Main app chrome lives in `app/layout.tsx`.
- Auth: NextAuth v4 in `lib/auth.ts` with Prisma adapter and a credentials-only dev login. Google is documented but not wired as a provider yet.
- Data: PostgreSQL via Prisma. Core models are `User`, `SocialAccount`, `Post`, `PostTarget`, and `ScheduledJob`.
- Publishing: `app/api/posts/route.ts` creates posts and targets, then calls `lib/publisher.ts` for immediate posts or `lib/scheduler.ts` for delayed jobs.
- Queue: `lib/scheduler.ts` uses `bull` v4 plus Redis. Queue processing currently runs inside the web process when the scheduler module is loaded.
- Platform adapters: `lib/oauth/linkedin.ts`, `lib/oauth/meta.ts`, and `lib/oauth/platforms.ts`.
- Uploads: `app/api/upload/route.ts` proxies signed uploads to Cloudinary and returns original plus eager variants.
- Analytics: `app/api/analytics/route.ts` computes post totals, per-platform breakdown, recent activity, and daily volume from Prisma queries.

## Deployment Setup

The repository supports two production paths:

- Direct server deployment with PM2: `ecosystem.config.js`, `deploy.sh`, `nginx.conf.example`.
- Docker Compose deployment: `Dockerfile` plus `docker-compose.yml`.

Important recent fixes:

- `next.config.ts` now sets `output: 'standalone'`, matching the Dockerfile's `.next/standalone` copy step.
- `next.config.ts` now externalizes `bull` so the Next/Turbopack production build does not bundle Bull child-process internals.
- `app/layout.tsx` no longer uses `next/font/google`, avoiding build-time network dependency on Google Fonts.
- Dynamic route handlers in `app/api/accounts/[id]/route.ts` and `app/api/posts/[id]/route.ts` now use Next 16 async `params`.
- Account connect pages using `useSearchParams()` are wrapped in `Suspense`, fixing Next 16 prerender build failures.

Verified build command:

```bash
/Users/gilbertneo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/next/dist/bin/next build
```

The normal shell Node is currently `16.14.0`, which is too old for Next 16. Use Node `>=20.9.0`.

## Staging Flow

There is no dedicated staging environment configured yet.

Recommended staging flow:

1. Create a separate staging database and Redis instance.
2. Use a separate staging domain such as `staging.postify...`.
3. Register every OAuth callback separately with each platform using the staging domain.
4. Use separate platform app credentials where possible, especially Meta and X.
5. Set `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `REDIS_URL`, and provider secrets to staging values.
6. Run `npx prisma db push` or, preferably after migrations are introduced, `npx prisma migrate deploy`.
7. Run `next build` before promoting to production.

## Env Structure

Core:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `REDIS_URL`
- `CRON_SECRET`

Auth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_HAS_GOOGLE`

Platform OAuth:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `META_CLIENT_ID`
- `META_CLIENT_SECRET`
- `TWITTER_CLIENT_ID`
- `TWITTER_CLIENT_SECRET`
- `PINTEREST_CLIENT_ID`
- `PINTEREST_CLIENT_SECRET`
- `TUMBLR_CONSUMER_KEY`
- `TUMBLR_CONSUMER_SECRET`

Media:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Important mismatch: `lib/env.ts` validates `NEXTAUTH_URL`, but most OAuth helper URLs use `NEXT_PUBLIC_APP_URL`. Missing `NEXT_PUBLIC_APP_URL` will break OAuth redirects even if env validation passes.

## Pending Tasks

- Add real auth providers. Google is documented and referenced in UI, but `lib/auth.ts` only defines credentials login.
- Add passwordless/email or production-safe login. Current credentials provider accepts any email and ignores password.
- Encrypt stored platform tokens and app passwords. Current token fields are plaintext.
- Fix Bluesky publishing. The connect route stores the app password as `accessToken`, but `postToBluesky()` expects an AT Protocol access JWT. Re-authenticate before posting or store/refresh the JWT correctly.
- Verify/fix Tumblr OAuth 1.0a request-token signing. Current request-token flow does not include a valid OAuth signature.
- Verify/fix OAuth state validation. Twitter validates state; LinkedIn, Meta, Pinterest, and Tumblr callbacks currently do not.
- Move scheduled job processing into a separate worker process. Running Bull processors inside web requests is fragile and will not scale cleanly.
- Replace `prisma db push --accept-data-loss` in `deploy.sh` with Prisma migrations before production.
- Align docs with code: README says Next.js 14 and BullMQ, but code uses Next.js 16 and `bull` v4.
- Add platform-specific validation before publish: character limits, media requirements, media counts, video/image support, and account token expiry.
- Add retries and replay controls per failed `PostTarget`.
- Add integration tests around `/api/posts`, scheduled cancellation, and OAuth save routes.
- Resolve lint debt. Production build passes, but ESLint still reports many pre-existing `any`, hook, image, and unescaped-entity issues.

## Important Warnings

- This app is not production-safe yet because secrets are stored plaintext and dev login can create/sign in arbitrary emails.
- Scheduled jobs may not run after process restarts unless a web request loads the scheduler and starts the Bull processor.
- Direct deploy script uses `prisma db push --accept-data-loss`; this can mutate production schema destructively.
- `middleware.ts` works but Next 16 warns that the middleware convention is deprecated in favor of `proxy`.
- The Dockerfile previously assumed standalone output. That is now configured, but Docker build was not separately verified.
- Cloudinary upload reads provider env values without validation in the route, so missing media env will fail at runtime.
- X/Twitter write access requires a paid API tier.
- Meta app review and platform permissions will likely be the longest external dependency before real production use.
