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

## Deployment Blockers (2026-08-06 — see QA/Phase-8B-Deployment-Certification-Report.md)

- [x] PUSH `76ee8ad` (release.yml: `aquasecurity/trivy-action@0.28.0` → `v0.30.0`) — local commit, cannot be pushed from this environment
- [x] Confirm GHCR has the a3ae2a4 image (Release run `31042238685` failed; no sha-tag ever pushed)
- [x] Force Coolify redeploy and run `prisma migrate deploy` on prod (3 pending migrations)
- [x] Verify prod health now returns `components` (currently absent → pre-Sprint-2 runtime)

## CI/CD Recovery Sprint (2026-08-06 — see QA/Phase-9-CICD-Recovery-Report.md)

- [x] Rebuild release.yml (all actions current, Trivy, cosign, SBOM, OCI label verify, artifacts, release per SHA)
- [x] Fix CI (DATABASE_URL, Redis+Postgres services, migrate deploy, --test-force-exit, node 22)
- [x] Clear Trivy gate (next 16.3.0, uuid override, strip bundled npm) — 45 → 0 HIGH/CRITICAL
- [x] Cloudflare runner-egress workaround (origin fallback in smoke test)
- [x] Certified release `9a3f76aa` end-to-end (CI → GHCR digest → Coolify → health commit)
- [ ] Switch Coolify to pull the GHCR digest instead of source build (strict digest provenance)
- [ ] Add Cloudflare WAF rule allowing GitHub Actions egress ranges
- [ ] Merge dependabot PRs (checkout v7, setup-node v7) to clear Node 20 deprecation warnings

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
