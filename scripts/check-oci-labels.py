#!/usr/bin/env python3
"""Verify required OCI labels on a docker image config JSON (stdin).

Usage:
  docker buildx imagetools inspect <ref> --format '{{json .Image}}' | python3 scripts/check-oci-labels.py

Exits 1 if any required label is missing.
"""
import json
import sys

REQUIRED = (
    "org.opencontainers.image.revision",
    "org.opencontainers.image.created",
    "org.opencontainers.image.source",
    "org.opencontainers.image.version",
)


def main() -> int:
    d = json.load(sys.stdin)
    missing = [k for k in REQUIRED if k not in d]
    if missing:
        print("::error:: missing OCI labels: %s" % missing)
        return 1
    print("OCI labels OK:")
    for k in REQUIRED:
        print("  %s = %s" % (k, d[k]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
