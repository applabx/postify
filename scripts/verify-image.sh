#!/usr/bin/env bash
# verify-image.sh — certify a published image against a Git commit.
#
# Usage:
#   ./scripts/verify-image.sh ghcr.io/applabx/postify:<tag-or-digest> <git-sha>
#
# Verifies (Phase 3 — Image Certification):
#   1. OCI labels: org.opencontainers.image.revision / created / source / version
#   2. revision label matches the requested Git SHA
#   3. image digest resolves
# Exits non-zero on any mismatch. Never prints secrets.
set -euo pipefail

REF="${1:?usage: verify-image.sh <image-ref> <git-sha>}"
SHA="${2:?usage: verify-image.sh <image-ref> <git-sha>}"

echo "==> Inspecting $REF"
INSPECT=$(docker buildx imagetools inspect "$REF" --format '{{json .Image}}')

REVISION=$(echo "$INSPECT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('org.opencontainers.image.revision',''))")
CREATED=$(echo "$INSPECT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('org.opencontainers.image.created',''))")
SOURCE=$(echo "$INSPECT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('org.opencontainers.image.source',''))")
VERSION=$(echo "$INSPECT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('org.opencontainers.image.version',''))")

FAIL=0
for k in revision created source version; do
  [ -z "${!k}" ] && echo "::error:: missing OCI label $k" && FAIL=1
done

if [ "$REVISION" != "$SHA" ]; then
  echo "::error:: revision label '$REVISION' does not match expected SHA '$SHA'"
  FAIL=1
fi

if [ $FAIL -ne 0 ]; then exit 1; fi

DIGEST=$(docker buildx imagetools inspect "$REF" --format '{{json .Manifest.Digest}}')
echo "PASS: $REF"
echo "  digest   = $DIGEST"
echo "  revision = $REVISION"
echo "  created  = $CREATED"
echo "  source   = $SOURCE"
echo "  version  = $VERSION"
