# Release Checklist (Automated)

Every release must clear the gate in `.github/workflows/release.yml`
(`release-checklist` job). Only when every check passes may the release be
considered **production-ready**.

| # | Check | Automated? | Where |
|---|---|---|---|
| 1 | CI passed (lint, prisma validate, tests, build) | ✅ | `ci.yml` (same SHA) |
| 2 | Docker build passed | ✅ | `build-and-push` job |
| 3 | Trivy passed (HIGH/CRITICAL, ignore-unfixed) | ✅ | `build-and-push` job (exit-code=1) |
| 4 | Image published | ✅ | `build-push-action@v7`, push=true |
| 5 | OCI labels correct (revision/created/source/version) | ✅ | `Verify OCI labels` step |
| 6 | Image signed (cosign keyless) + SBOM | ✅ | cosign + anchore/sbom-action |
| 7 | Migration successful | ⚠️ | applied at container start; verified via db component health + Coolify logs |
| 8 | Container healthy | ✅ | Docker HEALTHCHECK + smoke `uptimeSec >= 30` |
| 9 | Health endpoint correct (commit matches SHA) | ✅ | `smoke-test` job |
| 10 | RestartCount = 0 | ⚠️ | inferred via `uptimeSec`; exact count needs Coolify/Docker API (`kubectl`/`docker inspect` on server) |
| 11 | Queue healthy | ✅ | `components.queue == healthy` |
| 12 | OAuth healthy | ⚠️ | manual: connect a test account per platform; no automated OAuth probe yet |

## How to read the outcome

- **Green run** (`release-checklist` passes) → release is production-ready;
  `release-manifest.json` on the GitHub Release is the immutable record.
- **Red run** → the release is NOT production-ready. Do not deploy it.
  Fix forward (new commit) or roll back (`ROLLBACK.md`).

## Manual OAuth probe (check #12)

```bash
curl -s https://postify.applabx.com/api/health   # app up
# then connect a throwaway account for each platform in the UI and publish a test post.
```
