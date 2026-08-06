# Phase 8B — Sprint 2 (a3ae2a4) Deployment Certification Report

**Date:** 2026-08-06
**Status:** BLOCKED — CANNOT BE CERTIFIED
**Target commit:** `a3ae2a4b8a50fc2665ef8ba36c97dd70479c2752` (origin/master)

---

## Summary

Production deployment of Sprint 2 (`a3ae2a4`) is **BLOCKED**. The image was never built, the release pipeline fix cannot be pushed from this environment, and no Coolify/server access exists from here. Production is running **pre-Sprint-2 code** (SOURCE_COMMIT env lies about the runtime). Do not claim certification until an operator completes the checklist at the bottom of this report and the running image digest is verified.

---

## Findings

### F-01 — GHCR build for a3ae2a4 never happened (CRITICAL)

- Release workflow run `31042238685` failed at step 1.
- Root cause: `.github/workflows/release.yml` pins `aquasecurity/trivy-action@0.28.0`, which **does not exist** (invalid version introduced in Sprint 2's release.yml edit).
- Evidence: GHCR API — no `a3ae2a4...` sha-tag exists; `latest` manifest returns 404.
- Consequence: no image was pushed for the commit Coolify is configured to run.

### F-02 — Production is running stale, pre-Sprint-2 code (CRITICAL)

- `GET https://postify.applabx.com/api/health` returns `commit: a3ae2a4b8a50fc2665ef8ba36c97dd70479c2752` but **no `components` field**.
- `components` was added by Sprint 2 — its absence means the running binary predates Sprint 2. `SOURCE_COMMIT` env var ≠ running code.
- Behavioral probes: `verify-email` → correct public redirect (post-fe1abce code present); `POST /api/posts` malformed JSON → 307 auth redirect (no session, inconclusive).
- All Sprint 2 security work (exactly-once state machine, DNS SSRF guard, Redis rate limits) is **NOT live in production**.

### F-03 — Release pipeline fix exists locally but cannot be pushed (BLOCKER)

- Local commit `76ee8ad` — "ci: fix Trivy action version (release pipeline for a3ae2a4 was blocked)" — pins `aquasecurity/trivy-action@v0.30.0`.
- Push attempts failed: HTTPS → 403 (GitHub identity `investvietnamofficial` has no write access to `applabx/postify`), SSH → permission denied. `gh` token lacks `admin:repo_hook` (webhook inspection → 404).
- `origin/master` remains at `a3ae2a4`; local `master` is ahead by exactly this one commit.

### F-04 — No remote access to complete deployment

- No Coolify API token, no SSH to the server (keys denied / port closed). Container inspection, `prisma migrate deploy` on prod, and forced redeploy are impossible from this environment.

### F-05 — Migrations verified locally, ready for production (PASS)

All three pending migrations apply cleanly on the local DB (identical to prod schema base):

| Artifact | Migration | Verified |
|---|---|---|
| `Role` enum contains `REVIEWER` | `20260805_reviewer_role` | ✅ `USER, REVIEWER, ADMIN` |
| `Post` index `Post_userId_idx` | `20260806_post_userid_index` | ✅ `CREATE INDEX ... ON public."Post" USING btree ("userId")` |
| `TargetStatus` contains `PUBLISHING` | `20260806_target_publishing` | ✅ `PENDING, SUCCESS, FAILED, SKIPPED, PUBLISHING` |

`npx prisma migrate status` → "4 migrations found … Database schema is up to date!" (includes `20260729_init`).

---

## Evidence Log

| Item | Result |
|---|---|
| `git rev-parse origin/master` | `a3ae2a4b8a50fc2665ef8ba36c97dd70479c2752` |
| Local HEAD vs origin | ahead by 1 (`76ee8ad` release.yml trivy fix) |
| GHCR sha-tag for a3ae2a4 | does not exist |
| GHCR `latest` manifest | 404 |
| Release run `31042238685` | failed — trivy-action `0.28.0` invalid |
| Prod `/api/health` | `commit: a3ae2a4...` but **no `components`** → stale runtime |
| Rollback candidate | `ghcr.io/applabx/postify@sha256:44c133a80fcf97add9bc659ad7ba14ec5298b602dfa5484d55c593428bab836f` (revision `d612641`, current good image) |

---

## Operator Checklist (required before certification)

1. **Push the pipeline fix** — get `76ee8ad` (trivy-action `v0.30.0`) merged/pushed to `master`, or edit `release.yml` directly on GitHub.
2. **Confirm the image exists** — verify `ghcr.io/applabx/postify:a3ae2a4b8a50fc2665ef8ba36c97dd70479c2752` (or a digest) is pushed. Inspect `manifest` + revision label.
3. **Force Coolify redeploy** — Coolify UI → Postify → Deploy (reconnect the GitHub App / webhook first; see AGENTS.md "Active Production Issues").
4. **Run migrations on prod** — `npx prisma migrate deploy` (3 pending migrations above). Do NOT use `db push --accept-data-loss`.
5. **Verify the running image** — health endpoint must report `components` (and `uptimeSec`). Confirm container digest matches step 2.
6. **Run the 8-phase certification** — smoke, state machine, OAuth, SSRF, rate limit, observability, migration integrity, rollback drill.
7. **Seed reviewer account** if required by the reviewer system (see `20260805_reviewer_role` context).

Until step 5 passes, production remains on pre-Sprint-2 code and **must not be treated as certified**.
