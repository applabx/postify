# TODO.md

## High Priority

- [x] Rename proxy.ts → middleware.ts (was never loaded by Next.js)
- [x] Fix OAuth tokens exposed in URLs (server-side temp store)
- [x] Fix Bluesky token refresh and image uploads from publisher
- [x] Fix LinkedIn OAuth scopes (add offline_access, w_member_social) and refresh token handling
- [x] Fix schedule timezone bug (HCM UTC+7 vs browser local)
- [x] Fix scheduler processor registration at startup
- [x] Fix LinkedIn/Meta OAuth redirect_uri mismatch behind proxy
- [x] Fix mediaTypes for video uploads
- [x] Fix Tumblr OAuth 1.0a request token signature
- [x] Fix Instagram to support VIDEO and CAROUSEL media types
- [x] Extract `ensureSessionUser` into shared lib/session-user.ts
- [x] Fix Bluesky connect not setting tokenExpiry (refresh cron never triggered)
- [x] Fix Instagram video detection (mediaTypes now passed to publishToTarget)
- [x] Add magic byte validation in upload route
- [x] Remove duplicate @auth/prisma-adapter package
- [x] Add CSP header in next.config.ts
- [ ] Move Bull job processing out of the web process into a dedicated worker
- [ ] Replace `deploy.sh` schema push with Prisma migrations before production use
- [ ] Add `command: redis-server --appendonly yes` to docker-compose.yml

## Medium Priority

- [ ] Fix validateEnv() — it's dead code (never imported)
- [ ] Add total count metadata to paginated API responses
- [ ] Make sidebar responsive (collapse on mobile)
- [ ] Add account health UI on `/accounts`: configured, connected, expired, missing permission, and last publish status
- [ ] Hide or disable OAuth connect buttons when required provider env vars are missing
- [ ] Add platform-specific previews and allow optional text overrides per platform
- [ ] Add media validation by platform: image/video support, counts, sizes, and required image rules
- [ ] Add reconnect flows for expired or revoked tokens
- [ ] Add integration coverage for `/api/posts`, scheduled cancellation, OAuth save routes, upload, and token refresh
- [ ] Add dark mode support

## Technical Debt

- [ ] Align README with live code: Next.js 16, React 19, `bull` v4, `middleware.ts`, and current build caveats
- [ ] Reduce ESLint baseline warnings instead of only enforcing the current warning count
- [ ] Remove repeated inline style objects by extracting local components or shared style helpers where it reduces complexity
- [ ] Audit every token save path to confirm `encryptSecret()` is used consistently
- [ ] Add structured platform error mapping instead of exposing raw provider failures
- [ ] Add pagination and loading/error states for account, history, queue, and analytics APIs

## Future Ideas

- [ ] AI-assisted caption variants per platform
- [ ] Best-time-to-post suggestions from historical analytics
- [ ] Team/workspace support with roles and approvals
- [ ] Asset library for reusable images and videos
- [ ] Bulk upload/import of scheduled posts
- [ ] UTM/link tracking and campaign analytics
- [ ] Approval workflow before publishing to sensitive channels
- [ ] Webhooks or notifications for publish failures
