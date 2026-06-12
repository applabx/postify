# HANDOFF.md

Update this file before ending every coding session.

## Current Repository Status

- Folder: `/Users/gilbertneo/Desktop/My Apps/postify`.
- Git status: this folder is not currently a Git repository; `git status` returns `fatal: not a git repository`.
- Product: self-hosted multi-platform social publisher.
- Stack: Next.js `16.2.2`, React `19.2.4`, Prisma `5.22.0`, PostgreSQL, Redis, `bull` v4, NextAuth v4, Cloudinary.
- Main UX surfaces: `/compose`, `/accounts`, `/history`, `/queue`, `/analytics`, `/login`.
- Main API surfaces: `/api/posts`, `/api/accounts`, `/api/oauth/*`, `/api/upload`, `/api/analytics`, `/api/cron/refresh-tokens`.
- Current `.env` has the expected key names, including `TOKEN_ENCRYPTION_KEY`; secret values were not inspected.

## Recent Findings

- `AGENTS.md`, `TODO.md`, and `HANDOFF.md` were created for multi-agent development.
- `app/compose/page.tsx` already has account selection, image/video upload, scheduling fields, character-limit display, and a simple preview.
- `app/accounts/page.tsx` lists connected accounts by platform, flags expired tokens, and links to platform connect flows.
- `lib/publisher.ts` publishes targets in parallel and records per-target success/failure.
- `lib/scheduler.ts` uses Bull/Redis but registers the processor inside the web process.
- `lib/secrets.ts` supports AES-GCM token encryption when `TOKEN_ENCRYPTION_KEY` is set.
- `.github/workflows/ci.yml` runs lint gate and build on Node `20.11.1`.
- Local Mac build caveat remains: `npm run build` can fail through Turbopack/native binding issues; `npx next build --webpack` was the previously verified local path.

## Known Issues

- The folder is not a Git repository, so changes cannot be committed here until a repo is initialized or the folder is placed inside one.
- Auth is not production-safe yet; Google is documented but active auth is dev credentials-oriented.
- Scheduled publishing is fragile because Bull processing depends on web-process module loading.
- `deploy.sh` uses `npx prisma db push --accept-data-loss`, which is unsafe for production.
- Tumblr OAuth start is a placeholder and needs a real OAuth 1.0a request-token flow.
- Bluesky connect/post flow needs verification because posting requires a valid access JWT.
- OAuth state validation is not consistently verified across all platforms.
- Platform media and character rules are only partially enforced before publishing.
- README and older handoff notes contain drift from live code.

## Pending Tasks

- Prioritize the `/compose` workflow so posting to many destinations is hard to misconfigure.
- Add account health and reconnect states to `/accounts`.
- Add pre-publish readiness checks before `/api/posts` creates records.
- Add per-platform progress, results, and retry controls.
- Split Bull processing into a worker process.
- Replace dev auth and unsafe deploy schema flow before production.
- Add integration tests around posting, scheduling, OAuth save routes, upload, and cron.

## Recommended Next Actions

1. Initialize or connect a Git repository if commits are required.
2. Update `npm run build` or local docs to use the verified Webpack build path on macOS.
3. Implement pre-publish readiness checks in `/compose` using `lib/platforms.ts`.
4. Add platform/account health fields to the accounts API and UI.
5. Create a worker entrypoint for Bull processing and update deployment docs.
6. Replace `prisma db push --accept-data-loss` with migrations.

## MiniMax Handoff Prompt

You are working in `/Users/gilbertneo/Desktop/My Apps/postify`. Read `AGENTS.md` first and treat it as the source of truth. Update `TODO.md` and `HANDOFF.md` before ending the session. The product is a Next.js 16 self-hosted social publisher for composing one post and publishing/scheduling it across LinkedIn, Facebook, Instagram, X/Twitter, Threads, Bluesky, Pinterest, and Tumblr. Prioritize practical changes that make `/compose` safer and easier: destination selection, platform validation, account health, previews, publish progress, and retries. Do not modify env/secrets, Prisma schema, deployment files, auth, token encryption, scheduler, or publishing side effects without explicit approval. Verify with `npm run lint:gate`; on this Mac prefer `npx next build --webpack` over plain `npm run build` if native binding errors appear.
