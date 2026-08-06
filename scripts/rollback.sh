#!/bin/bash
# rollback.sh — immutable rollback to a previously certified image digest.
#
# Rollback NEVER relies on :latest. Every deployment is recorded as a
# release-manifest.json artifact (see .github/workflows/release.yml →
# release-manifest job) containing: git SHA, image digest, migration state,
# published timestamp, release tag, and this rollback target.
#
# Usage:
#   ROLLBACK_DIGEST=<sha256:...> ./scripts/rollback.sh
#   # or
#   ./scripts/rollback.sh ghcr.io/applabx/postify@sha256:...
#
# Requirements: docker, access to GHCR, and a Coolify deployment that pulls
# by digest. Update COOLIFY_APP_UUID/COOLIFY_URL/COOLIFY_API_KEY to match
# your environment (passed via env or vars).
set -euo pipefail

DIGEST_OR_REF="${1:-${ROLLBACK_DIGEST:?usage: rollback.sh <sha256:digest> or set ROLLBACK_DIGEST}}"
REF="ghcr.io/applabx/postify@$DIGEST_OR_REF"
[[ "$DIGEST_OR_REF" == ghcr.io/* ]] && REF="$DIGEST_OR_REF"

echo "==> Verifying rollback target exists: $REF"
docker buildx imagetools inspect "$REF" >/dev/null

echo "==> Recording rollback decision"
cat >> RELEASE_ROLLBACK_LOG.md <<EOF
| $(date -u +%Y-%m-%dT%H:%M:%SZ) | $REF | $(git rev-parse HEAD 2>/dev/null || echo n/a) | manual |
EOF

if [ -n "${COOLIFY_API_KEY:-}" ]; then
  COOLIFY_URL="${COOLIFY_URL:-https://coolify.applabx.com}"
  COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-eehzi4dz98bay175wko3wqut}"
  echo "==> Pinning Coolify app $COOLIFY_APP_UUID to digest $DIGEST_OR_REF"
  curl -f -sS -X PATCH \
    -H "Authorization: Bearer $COOLIFY_API_KEY" \
    -H "Content-Type: application/json" \
    "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP_UUID" \
    -d "{\"docker_compose_domains\":\"\",\"image\":\"$REF\"}" || \
    echo "WARN: auto-pin failed — set the Coolify image field to '$REF' manually, then Deploy."
else
  echo "==> No COOLIFY_API_KEY — manual step:"
  echo "    1. Coolify UI → postify → Configuration → Docker Image = $REF"
  echo "    2. Coolify UI → postify → Restart"
fi

echo "==> Verify after deploy: curl -s https://postify.applabx.com/api/health (commit must equal the rollback SHA)"
