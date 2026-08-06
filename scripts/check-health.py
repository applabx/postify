#!/usr/bin/env python3
"""Smoke-check a production /api/health response.

Usage:
  python3 scripts/check-health.py <health-json-file> <expected-commit> [expected-digest|-]

Environment:
  REQUIRE_IMAGE_DIGEST=true — fail when the deployment is not digest-pinned
  (health.image missing or != expected-digest) — immutable-deployment mode.

Asserts (Phase 6 smoke tests):
  - status == "ok"
  - commit == expected commit SHA
  - components: db, redis, queue, worker all healthy/running
  - uptimeSec >= 30 (container did not just restart)
  - image (optional): if present it must equal the expected GHCR digest;
    in REQUIRE_IMAGE_DIGEST mode a missing/mismatched image fails the run
  - workers (optional): when present and non-empty, heartbeats must be fresh
Exits 1 on any failure.
"""
import json
import os
import sys
from datetime import datetime, timezone


def main() -> int:
    path, expected_commit = sys.argv[1], sys.argv[2]
    expected_digest = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "-" else None
    require_digest = os.environ.get("REQUIRE_IMAGE_DIGEST") == "true"

    with open(path) as f:
        body = json.load(f)

    assert body.get("status") == "ok", body
    commit = body.get("commit")
    assert commit == expected_commit, f"commit={commit} expected={expected_commit}"

    c = body.get("components", {})
    for k in ("db", "redis", "queue", "worker"):
        assert k in c, f"missing component {k}: {body}"
        assert c[k] in ("healthy", "running"), f"{k} unhealthy: {c[k]}"

    uptime = body.get("uptimeSec", 0)
    assert uptime >= 30, f"container restarted recently (uptimeSec={uptime})"

    image = body.get("image")
    if image:
        if expected_digest and image != expected_digest:
            print(f"::error:: running image {image} != release digest {expected_digest}")
            return 1
        print("image matches release digest:", image)
    elif require_digest:
        print("::error:: deployment is not digest-pinned (health.image missing)")
        return 1
    else:
        print("health.image absent — deployment not yet digest-pinned (see docs/OPERATIONS.md)")

    workers = body.get("workers")
    if isinstance(workers, list) and workers:
        now = datetime.now(timezone.utc)
        fresh = 0
        for w in workers:
            try:
                last = datetime.fromisoformat(w["lastHeartbeat"].replace("Z", "+00:00"))
                if (now - last).total_seconds() <= 60:
                    fresh += 1
            except (KeyError, ValueError):
                pass
        print(f"workers: {len(workers)} registered, {fresh} with fresh heartbeats")
        assert fresh > 0, f"no fresh worker heartbeats: {workers}"

    print("SMOKE PASS — components:", json.dumps(c))
    print("uptimeSec:", uptime)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 - surface assertion/traceback for CI logs
        print(f"::error:: smoke check failed: {e}", file=sys.stderr)
        sys.exit(1)
