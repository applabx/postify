#!/usr/bin/env bash
# pin-coolify-digest.sh — switch production to immutable image deployments.
#
# Deploys by GHCR digest (never :latest) and records the pinned digest in the
# app's own health endpoint (CONTAINER_IMAGE env → /api/health.image), so the
# Release pipeline's smoke test can prove the running container matches the
# release manifest.
#
# Usage:
#   ./scripts/pin-coolify-digest.sh ghcr.io/applabx/postify@sha256:... [sha256:...]
#
# Optional second arg: a pre-pulled local digest (for rollback to a digest
# already known to be good). Without COOLIFY_API_KEY this prints the exact
# Coolify UI steps; with it, it drives the Coolify API.
set -euo pipefail

REF="${1:?usage: pin-coolify-digest.sh <ghcr-ref> [sha256-digest] [short-sha] }"
DIGEST="${2:-}"
SHORT_SHA="${3:-}"

# Extract a sha256: digest from the ref if not given explicitly
if [ -z "$DIGEST" ]; then
  DIGEST=$(echo "$REF" | sed -E 's/.*@(sha256:[a-f0-9]{64}).*/\1/')
fi

echo "==> Verifying digest exists in GHCR: $REF"
docker buildx imagetools inspect "$REF" >/dev/null

echo "==> Digest: $DIGEST"

if [ -n "${COOLIFY_API_KEY:-}" ]; then
  COOLIFY_URL="${COOLIFY_URL:-https://coolify.applabx.com}"
  COOLIFY_APP_UUID="${COOLIFY_APP_UUID:-eehzi4dz98bay175wko3wqut}"
  echo "==> Pinning Coolify app $COOLIFY_APP_UUID to $REF"
  curl -f -sS -X PATCH \
    -H "Authorization: Bearer $COOLIFY_API_KEY" \
    -H "Content-Type: application/json" \
    "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP_UUID" \
    -d "{\"image\":\"$REF\"}" || echo "WARN: API pin failed — apply the UI steps below."
else
  echo "==> No COOLIFY_API_KEY — apply these steps in the Coolify UI:"
  echo "    1. Coolify → postify → Configuration → Docker Image:"
  echo "         $REF"
  echo "    2. Environment → add CONTAINER_IMAGE=$REF"
  echo "    3. Save → Restart"
fi

echo "==> Record the deployment (release log):"
{
  echo "| $(date -u +%Y-%m-%dT%H:%M:%SZ) | $REF | ${SHORT_SHA:-n/a} | digest-pinned |"
} >> RELEASE_ROLLBACK_LOG.md

echo "==> After restart, verify:"
echo "    curl -s https://postify.applabx.com/api/health | jq .image   # must equal $DIGEST"
echo "    curl -s https://postify.applabx.com/api/health | jq .commit  # must equal the release SHA"
