#!/usr/bin/env python3
"""Smoke-check a production /api/health response.

Usage:
  python3 scripts/check-health.py <health-json-file> <expected-commit>

Asserts (Phase 6 smoke tests):
  - status == "ok"
  - commit == expected commit SHA
  - components: db, redis, queue, worker all healthy/running
  - uptimeSec >= 30 (container did not just restart)
Exits 1 on any failure.
"""
import json
import sys


def main() -> int:
    path, expected_commit = sys.argv[1], sys.argv[2]
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

    print("SMOKE PASS — components:", json.dumps(c))
    print("uptimeSec:", uptime)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 - surface assertion/traceback for CI logs
        print(f"::error:: smoke check failed: {e}", file=sys.stderr)
        sys.exit(1)
