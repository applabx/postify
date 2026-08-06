# Rollback Engineering (Immutable Rollback)

Rollback **never relies on `:latest`**. Every release is an immutable artifact
keyed by digest, and every deployment is recorded.

## Release Record

Every successful Release workflow run produces:

- **`release-manifest.json`** — attached to the GitHub Release `release-<sha>`
  and containing: repository, git SHA, workflow run ID, image digest, tags,
  published timestamp, Trivy result, signature, SBOM, migration state.
- **GitHub Release `release-<sha>`** — tag pinned to the exact commit SHA.
- **Image tags** — `latest` is a convenience pointer only; the canonical
  reference is `ghcr.io/applabx/postify@sha256:<digest>`.
- **`release-evidence-<sha>` artifact** — Trivy SARIF + CycloneDX SBOM.

| Field | Source |
|---|---|
| Git SHA | `github.sha` (workflow) |
| Image Digest | `steps.build.outputs.digest` (build-push-action) |
| Migration State | applied at container start (`docker-entrypoint.sh` → `prisma migrate deploy`) |
| Timestamp | `published_at` in manifest |
| Release Tag | `release-<sha>` |
| Rollback Target | previous certified `release-<prevsha>` digest |

## Procedure

1. **Find the last known-good release** — pick the newest `release-<sha>`
   GitHub Release whose manifest shows Trivy PASS and whose health checks
   passed (see `RELEASE_CHECKLIST.md`).
2. **Verify the digest exists** — `docker buildx imagetools inspect
   ghcr.io/applabx/postify@sha256:<digest>`
3. **Pin Coolify to that digest** (never `:latest`):
   - Automatic: `COOLIFY_API_KEY=... ./scripts/rollback.sh sha256:<digest>`
   - Manual: Coolify UI → postify → Configuration → Docker Image =
     `ghcr.io/applabx/postify@sha256:<digest>` → Restart.
4. **Verify** — `curl -s https://postify.applabx.com/api/health` must report
   `commit` equal to the rollback SHA and all components healthy.
5. **Log the rollback** — `scripts/rollback.sh` appends to
   `RELEASE_ROLLBACK_LOG.md`; record the incident in `HANDOFF.md`.

## Migration Caveat

Rollback targets must have compatible migrations. Because migrations are
applied at container start (`prisma migrate deploy`), a rollback to an older
image does NOT roll back schema changes. Migrations are forward-only:
- New-image migrations are additive (Sprint 2 migration set: enums + index).
- If a rollback image predates a schema the production DB now has, Prisma
  detects drift (`prisma migrate status`) and the entrypoint fails fast —
  do not force-push schema to bypass; restore from a verified DB backup.
