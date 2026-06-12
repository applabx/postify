# TODO.md

Update this file before ending every coding session.

## High Priority

- [ ] Make `/compose` the primary workflow: draft text, media, platform selection, preview, validation, publish, and schedule in one polished flow.
- [ ] Add pre-publish readiness checks for selected accounts, expired tokens, required media, character limits, missing env, and invalid schedule times.
- [ ] Show per-platform publish progress and final results, including retry actions for failed `PostTarget` rows.
- [ ] Move Bull job processing out of the web process into a dedicated worker.
- [ ] Replace dev credentials login with production-safe auth.
- [ ] Replace `deploy.sh` schema push with Prisma migrations before production use.
- [ ] Verify and fix Bluesky posting so saved credentials produce a valid AT Protocol access JWT at publish time.
- [ ] Implement a real Tumblr OAuth 1.0a request-token flow and verify posting.

## Medium Priority

- [ ] Add account health UI on `/accounts`: configured, connected, expired, missing permission, and last publish status.
- [ ] Hide or disable OAuth connect buttons when required provider env vars are missing.
- [ ] Add platform-specific previews and allow optional text overrides per platform.
- [ ] Add media validation by platform: image/video support, counts, sizes, and required image rules.
- [ ] Add reconnect flows for expired or revoked tokens.
- [ ] Add a queue calendar view with timezone-safe scheduling controls.
- [ ] Add reusable content templates, hashtag sets, and duplicate-from-history.
- [ ] Add integration coverage for `/api/posts`, scheduled cancellation, OAuth save routes, upload, and token refresh.

## Technical Debt

- [ ] Align README with live code: Next.js 16, React 19, `bull` v4, `proxy.ts`, and current build caveats.
- [ ] Reduce ESLint baseline warnings instead of only enforcing the current warning count.
- [ ] Remove repeated inline style objects by extracting local components or shared style helpers where it reduces complexity.
- [ ] Audit OAuth state validation across LinkedIn, Meta, Pinterest, Tumblr, and Twitter.
- [ ] Audit every token save path to confirm `encryptSecret()` is used consistently.
- [ ] Add structured platform error mapping instead of exposing raw provider failures.
- [ ] Add pagination and loading/error states for account, history, queue, and analytics APIs.
- [ ] Confirm Docker production build and runtime independently from local host build.

## Future Ideas

- [ ] AI-assisted caption variants per platform.
- [ ] Best-time-to-post suggestions from historical analytics.
- [ ] Team/workspace support with roles and approvals.
- [ ] Asset library for reusable images and videos.
- [ ] Bulk upload/import of scheduled posts.
- [ ] UTM/link tracking and campaign analytics.
- [ ] Approval workflow before publishing to sensitive channels.
- [ ] Webhooks or notifications for publish failures.
