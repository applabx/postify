# Postify Production Readiness Audit — Sprint 2

Audit date: 2026-08-06
Scope: entire repository, evidence-based. LinkedIn Community Management API
approval is excluded (external dependency); code paths for both the
OIDC-only state and post-approval org state are verified.

---

## Scoring (0–10)

| Category | Score | Key evidence |
|---|---|---|
| Architecture | 6 | Sound App Router + lib split; publisher/scheduler/temp-store clean; web-process worker is a known constraint |
| Security | 6 | Middleware, CSRF on register, encrypted tokens, env guards, magic-byte uploads; gaps: SSRF via mediaUrls, no API timeouts, in-memory rate limits, CSP allows unsafe-inline |
| Performance | 5 | 4–37ms latency measured; 32 axios calls without timeouts; upload buffers whole file; no pagination metadata |
| Scalability | 4 | Bull in web process (documented), in-memory rate limiting, single-instance assumptions |
| Maintainability | 7 | Shared helpers (redirect-url, session-user, authz); some dead code (validateEnv platform map unused), duplicated style objects |
| Reliability | 5 | Reconciliation + stuck recovery + idempotency exist; missing axios timeouts → hung publishes; Bull default 30s lock → stalled duplicates; no index on Post.userId |
| Testing | 4 | 10 tests (redirects/reviewer/env); zero API/route/publisher tests |
| DevOps | 5 | Multi-stage Docker, GHCR pipeline, migrations; no HEALTHCHECK, no image/CI security scanning |
| Developer Experience | 6 | Good docs, seed commands, lint gate; no structured logging/trace IDs |
| UX | 6 | Dense operator UI; no loading state on compose account fetch; no draft persistence |

**Overall: 5.4/10 — NOT production-grade yet.**

---

## Phase 2 — Ranked Findings

### P0 — Production blockers
(none found in current code)

### P1 — Critical

| # | Finding | Evidence | Root cause | Fix | Effort |
|---|---|---|---|---|---|
| P1-1 | **No HTTP timeouts on any platform API call → publish can hang forever** | 32 `axios.*` calls in `lib/oauth/`, 0 with `timeout` (grep) | axios default timeout=0 | Shared axios instance with 30s timeout in `lib/oauth/http.ts`; use in all platform libs + token-refresh | S |
| P1-2 | **Bull job lock 30s default → long publishes get stalled and re-processed (duplicate publish risk)** | `lib/scheduler.ts` sets no `lockDuration` (default 30s) | Multi-platform publish can exceed 30s | Set `lockDuration: 300000` (5 min) | XS |
| P1-3 | **SSRF: `mediaUrls` accepts arbitrary URLs; Bluesky publish fetches them server-side** | `app/api/posts/route.ts:11` (no host validation); `lib/publisher.ts:167` `fetch(url)` | No validation of URL host | Validate mediaUrls: https-only, block IP literals, localhost, private/loopback hosts | S |
| P1-4 | **Malformed JSON → HTTP 500** | `app/api/posts/route.ts:37` `await req.json()` no try/catch (reproduced 500 earlier) | Route handler throws | try/catch → 400 | XS |
| P1-5 | **Invalid status filter → HTTP 500 (Prisma enum error)** | `app/api/posts/route.ts:129` `status as any` | Unvalidated enum passed to Prisma | Zod-validate query: status enum, limit 1–100, page ≥1 → 400 | XS |

### P2 — High

| # | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| P2-1 | No index on `Post.userId` (every list/analytics query filters by it) | schema has only SocialAccount index | Migration `20260806_post_userid_index` | XS |
| P2-2 | API rate limiting in-memory only (resets on restart, not shared) | `lib/rate-limit.ts:9` `new Map` | (Sprint 2) Redis-backed limiter reuse from lib/auth | M |
| P2-3 | Publish results not surfaced with pagination metadata; history has no total count | `GET /api/posts` returns array only | (Sprint 2) return `{ posts, total, page, pageSize }` | S |
| P2-4 | LinkedIn/X media silently dropped (mediaAssets/mediaIds never populated) | publisher passes text-only for LINKEDIN/TWITTER | (Sprint 3) media upload flows per platform | L |
| P2-5 | No structured logging / trace IDs / request logging | all `console.log` | (Sprint 2) request-id middleware + structured log helper | M |
| P2-6 | Compose page no loading state for accounts fetch | `app/compose/page.tsx` renders "No platforms selected" until fetch resolves | (Sprint 3) loading state | S |

### P3 — Medium

| # | Finding | Evidence | Fix | Effort |
|---|---|---|---|---|
| P3-1 | Publisher logs full AxiosError object (dozens of lines per failure) | `lib/publisher.ts:72` `console.error(..., result.reason)` | Log `message` + status only | XS |
| P3-2 | Upload buffers the entire file for magic-byte check | `app/api/upload/route.ts:30` `Buffer.from(await file.arrayBuffer())` | Read first 8 bytes via `file.slice(0,8)` | XS |
| P3-3 | No Docker HEALTHCHECK | `Dockerfile` grep | `HEALTHCHECK` using node fetch against /api/health | XS |
| P3-4 | No CI security/dependency scanning | ci.yml grep = 0 scanners | Add dependabot.yml + trivy step (Sprint 2) | S |
| P3-5 | `limit`/`page` unbounded in posts list (DoS via huge skip) | `app/api/posts/route.ts:110-111` | Clamped in P1-5 | XS |
| P3-6 | Orphan Cloudinary uploads on abort/failure; no cleanup | upload route has no cleanup path | (Sprint 2) note only — manual/admin cleanup | M |
| P3-7 | Demo/legacy docs drift (README references Supabase, Next 14) | README | (Sprint 4) docs refresh | S |

### P4 — Low
- No dumb-init in container (node as PID1), no graceful-shutdown hooks
- No publish-failure notifications (email/webhook)
- Draft persistence not implemented (composer state lost on refresh)
- Accessibility: missing aria-labels on icon-only buttons; no keyboard focus tests
- analytics route: 7 parallel queries, no partial-failure handling
- duplicate style-object pattern across pages (consistency > abstraction, acceptable)

---

## Phase 3 — Roadmap

### Quick Wins (this sprint, already fixed historically)
Auth middleware, OAuth pending peek/consume, account lockout, LinkedIn scopes
+ redirect base, cold-start rate limit, Docker EACCES, env guards.

### Sprint 1 (implemented below)
P1-1..P1-5, P2-1, P3-1, P3-2, P3-3 + API-validation tests + dependabot.

### Sprint 2
P2-2 (Redis rate limiting), P2-5 (structured logging + request IDs), P3-4
(trivy), pagination metadata, upload orphan cleanup note.

### Sprint 3
P2-4 (LinkedIn/X media uploads), P2-6 (compose loading), drafts, accessibility pass.

### Sprint 4
P3-7 docs, dumb-init + graceful shutdown, notifications, monitoring
(Prometheus metrics endpoint).

### Long-term
Dedicated Bull worker service, multi-tenant workspaces, per-platform retry UI.

---
