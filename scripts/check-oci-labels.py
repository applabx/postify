#!/usr/bin/env python3
"""Verify required OCI labels on a docker image config JSON (stdin).

Usage:
  docker buildx imagetools inspect <ref> --format '{{json .Image}}' | python3 scripts/check-oci-labels.py

The inspect output can be either a flat image config (labels at
`config.Labels`) or a platform map (`{<platform>: {config: {Labels: ...}}}`).
Both shapes are handled. Exits 1 if any required label is missing.
"""
import json
import sys

REQUIRED = (
    "org.opencontainers.image.revision",
    "org.opencontainers.image.created",
    "org.opencontainers.image.source",
    "org.opencontainers.image.version",
)


def collect_labels(d: dict) -> dict:
    out = {}
    if not isinstance(d, dict):
        return out
    if "config" in d and isinstance(d.get("config"), dict):
        labels = d["config"].get("Labels")
        if isinstance(labels, dict):
            out.update(labels)
    else:
        # platform map (multi-arch index / attestation index)
        for v in d.values():
            if isinstance(v, dict) and isinstance(v.get("config"), dict):
                labels = v["config"].get("Labels")
                if isinstance(labels, dict):
                    out.update(labels)
    if not out:
        out = {k: v for k, v in d.items() if k.startswith("org.opencontainers.image.")}
    return out


def main() -> int:
    d = json.load(sys.stdin)
    labels = collect_labels(d)
    missing = [k for k in REQUIRED if k not in labels]
    if missing:
        print("::error:: missing OCI labels: %s" % missing)
        print("::debug:: found labels: %s" % sorted(labels.keys()))
        return 1
    print("OCI labels OK:")
    for k in REQUIRED:
        print("  %s = %s" % (k, labels[k]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
