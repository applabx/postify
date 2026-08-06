#!/usr/bin/env python3
"""Check that the CI workflow passed for a commit.

Usage:
  python3 scripts/check-ci.py <owner/repo> <sha>

Environment: GITHUB_TOKEN (workflow token with checks: read).

Exit codes:
  0 - CI passed (print "success")
  1 - CI failed or check-runs API error (permanent; print the reason)
  2 - CI not finished yet (print "pending" or "absent")
"""
import json
import os
import sys
import urllib.error
import urllib.request

REPO, SHA = sys.argv[1], sys.argv[2]
URL = f"https://api.github.com/repos/{REPO}/commits/{SHA}/check-runs"
TOKEN = os.environ.get("GITHUB_TOKEN", "")

req = urllib.request.Request(
    URL,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "postify-release-gate",
    },
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
except urllib.error.HTTPError as e:
    print(f"absent (HTTP {e.code})")
    sys.exit(2)
except Exception as e:  # noqa: BLE001
    print(f"absent (error: {e})")
    sys.exit(2)

runs = [
    c["conclusion"]
    for c in data.get("check_runs", [])
    if c.get("name") == "build" and c.get("app", {}).get("slug") == "github-actions"
]
conclusion = runs[-1] if runs else "absent"
print("CI conclusion:", conclusion)

if conclusion == "success":
    sys.exit(0)
if conclusion in ("failure", "timed_out", "action_required", "cancelled"):
    print("::error:: CI did not pass for this SHA")
    sys.exit(1)
sys.exit(2)  # pending / absent / unknown -> retry
