# Phase 8A — Deployment Integrity Validation Report
**Date:** 2026-06-15
**Status:** COMPLETE
**Author:** Mavis

---

## Summary

Deployment integrity is **FAILED**. The production container is running stale code. No security fix (D-01, D-02, D-03) has reached production. All Phase 8 QA results are **INVALID** until this is resolved.

---

## Root Cause

The release workflow (`release.yml`) has had a **YAML syntax error on line 68** since commit `a67cfd4` (2026-06-14). This causes the workflow to fail on every push, preventing any new images from reaching GHCR. Coolify is configured to pull `ghcr.io/applabx/postify:deaf42f` but that tag **does not exist** on GHCR. Production is running the image from the **initial deployment** (~48 hours before the release workflow was added).

### The Broken Step (lines 60-71)

```yaml
- name: Make GHCR package public
  run: |
    curl -s -X PATCH \
      -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
      -H "Content-Type: application/json" \
      "https://api.github.com/orgs/${{ github.repository_owner }}/packages/container/${{ env.IMAGE_NAME }}" \
      -d '{"visibility":"public"}' | \
      python3 -c "
import json,sys
d=json.load(sys.stdin)
print('visibility:', d.get('visibility','error: '+str(d)[:200]))
"
```

**Root cause:** GitHub Actions' YAML preprocessor evaluates `${{ }}` expressions before the shell executes the heredoc. The combination of `${{ secrets.GITHUB_TOKEN }}` on line 63, the `repository_owner` expansion in the URL on line 65, and the heredoc followed by `python3 -c "..."` (Python string with parentheses and brackets inside) causes GitHub Actions to misparse the heredoc boundary. The Python code on line 68 is interpreted as a new YAML key rather than part of the shell script, producing "Invalid workflow file: .github/workflows/release.yml#L68".

**Why it passed locally:** Local Python `yaml.safe_load()` does not process `${{ }}` expressions. GitHub Actions uses its own preprocessor that does.

**The step is non-essential:** The build-and-push step already succeeds. The `latest` tag is set automatically by `docker/metadata-action` with `enable=${{ github.ref == 'refs/heads/master' }}`. The "make public" step was added as a cosmetic fix to expose the package in the GHCR web UI — it does not affect whether images can be pulled.

---

## Evidence

### GitHub Actions — Release Workflow

| Commit | SHA | Result | Date |
|---|---|---|---|
| Initial (build+push only) | `731440a` | **SUCCESS** | 2026-06-14 06:15 |
| Add "make public" step | `a67cfd4` | **FAIL** | 2026-06-14 11:19 |
| 10 subsequent commits | `a67cfd4`→`deaf42f` | **ALL FAIL** | Ongoing |
| Security fixes (D-01/02/03) | `deaf42f` | **FAIL** | 2026-06-14 19:30 |

All failures are at the same step: `Make GHCR package public` → "Invalid workflow file: .github/workflows/release.yml#L68"

### GitHub — Webhooks

```
GET /repos/applabx/postify/hooks → 200 OK
Response: []  ← ZERO webhooks registered
```

No GitHub webhook exists on the `applabx/postify` repository. Therefore Coolify never receives push events and cannot trigger builds automatically.

### Coolify — App Configuration

| Field | Value | Implication |
|---|---|---|
| `docker_registry_image_name` | `ghcr.io/applabx/postify:deaf42f` | Override set but tag does not exist on GHCR |
| `git_commit_sha` | `"HEAD"` (literal string) | Coolify cannot detect new commits |
| `is_webhook` | `false` (per deployment records) | No auto-deploy capability |
| `build_pack` | `dockercompose` | Uses compose file, not Dockerfile build |
| `static_image` | `nginx:alpine` | Traefik proxy |
| App created | 2026-06-12T05:55:02Z | ~48 hours before release workflow existed |

### Deployment Timeline

```
2026-06-12 05:55  Postify app created in Coolify
                   → Initial image built from code at that time (~cceb9b5 era)
2026-06-14 06:15  Release workflow added (731440a) — build+push succeeds
2026-06-14 11:19  "Make GHCR package public" added (a67cfd4) — WORKFLOW BREAKS
2026-06-14 18:25  D-01/02/03 security fixes pushed
2026-06-14 19:30  Latest attempt — STILL FAILS
2026-06-15         Production STILL running initial deploy image (no D-01/02/03)
```

### Coolify Deployment History (via `POST /start` API)

Every `POST /start` after a git push has resulted in:
- `status: finished`
- `is_webhook: false` (API-triggered, not webhook)
- `is_pull_only: null` (no pull detected)
- `docker_registry_image_tag: null` (not set in deployment record)
- Duration: **2–5 seconds** (no real work done — just container restart)

This confirms Coolify is **not pulling new images**, only restarting with the cached local image.

### QA Validity

| Test | Verdict | Valid? |
|---|---|---|
| D-01 (emailVerified gate) | ✅ Blocked unverified user | **NOT VALID** — code not deployed |
| D-02 (CSRF on register) | ❌ CSRF bypassed | **NOT VALID** — code not deployed |
| D-03 (Redis rate limit) | ⚠️ In-memory fallback | **NOT VALID** — code not deployed |
| All Phase 8 product tests | Mixed | **NOT VALID** until new image is deployed |

---

## Are Production and GHCR Running the Same Image?

**NO.** They are NOT the same image.

| | Production Container | GHCR |
|---|---|---|
| **Image** | `ghcr.io/applabx/postify:latest` | `ghcr.io/applabx/postify:deaf42f` |
| **Tag exists?** | YES (pushed 2026-06-14 06:15, commit 731440a) | **NO** (workflow failed) |
| **Code version** | ~cceb9b5 era (pre-D-01/02/03) | Does not exist |
| **Created** | ~2026-06-12 | N/A |

## Are Production and GitHub Running the Same Commit?

**NO.** Production is running code from the initial deployment (~2026-06-12, commit ~cceb9b5). GitHub HEAD is `deaf42f`. There are approximately **20 commits** between the running code and HEAD.

---

## Coolify Investigation

### GitHub App Status
- **Source type:** `App\Models\GithubApp`
- **Source ID:** `2`
- **GitHub App:** `vo1crbnhartzt5pofv1ypu7s` ("applabx")
- **Installation:** `137023684`
- **is_webhook_connected:** Cannot confirm — `GET /sources` returns 404 for this API key's scope

### Webhook Status
- **Repo webhooks:** 0 (confirmed via `GET /repos/applabx/postify/hooks`)
- **Coolify receives push events:** NO
- **Result:** `git_commit_sha` stays as literal `"HEAD"` — no new commit detection

### Auto-Deploy Status
- **Working?** NO
- **Reason:** No webhook → no push events → Coolify never triggers builds on push
- **Workaround in use:** Manual `POST /applications/{uuid}/start` via API

### Image Pull Policy
- **Configured:** `docker_registry_image_name = ghcr.io/applabx/postify:deaf42f`
- **Effective policy:** Docker default (`if_not_present`) — only pulls if image doesn't exist locally
- **Result:** Old `latest` image already cached locally → never re-pulled
- **Coolify compose:** Uses `docker compose up -d` which respects Docker's pull policy

### Why POST /start Does Not Pull Latest Image
1. Coolify updates `docker_registry_image_name` in its compose file
2. `POST /start` triggers `docker compose up -d`
3. Docker sees `image: ghcr.io/applabx/postify:deaf42f` but `latest` already exists locally
4. Docker does **not** re-pull because `imagePullPolicy` defaults to `if_not_present`
5. Container restarts with old cached `latest` image
6. Deploy completes in 2-5 seconds (no real pull/build observed)

---

## Remediation Plan

### Step 1: Fix the Release Workflow (2 minutes)

Remove the broken "Make GHCR package public" step. The step is cosmetic — GHCR packages are readable when the actor has `packages: read` scope, which the build-and-push step already has.

```yaml
# REMOVE lines 60-71 from .github/workflows/release.yml:
# DELETE:
#       - name: Make GHCR package public
#         run: |
#           curl -s -X PATCH ...
#           python3 -c "import json,sys ..."
```

After removal, the workflow reverts to the `731440a` state which was verified working.

### Step 2: Push the Fix (1 minute)

```bash
git add .github/workflows/release.yml
git commit -m "fix: remove broken Make GHCR package public step — YAML heredoc conflicts with GHA preprocessor"
git push origin master
```

### Step 3: Verify Build Succeeds (3-5 minutes)

```bash
gh run watch  # or poll via API
```

Watch for: `.github/workflows/release.yml` run → SUCCESS → image tagged `sha-` + `latest` on GHCR.

### Step 4: Reconnect GitHub Webhook in Coolify (Manual — Gilbert)

**This requires manual action in the Coolify UI.**

1. Go to Coolify → postify → **Sources** tab
2. Find the `applabx` GitHub App source
3. Click **Reconnect** or **Refresh Installation**
4. Authorize the GitHub App for the `applabx/postify` repo
5. Confirm: `GET /repos/applabx/postify/hooks` should return 1 webhook

This enables push-to-deploy automation permanently.

### Step 5: Force Pull Latest Image (after Step 4)

Once the release workflow succeeds and `deaf42f` is on GHCR:

```bash
# Option A: Via Coolify UI
# Force Rebuild button in the postify app dashboard

# Option B: Via API — update compose file image tag to trigger a real pull
# PATCH docker_registry_image_name to a NEW tag, then POST /start
# The new tag forces Docker to pull (tag doesn't exist locally)
```

### Step 6: Verify Deployment Integrity (Final Check)

```bash
# After new image is deployed, verify:
# 1. /api/csrf/register returns JSON (not 307 redirect)
# 2. POST /api/auth/register without csrfToken returns 403
# 3. Unverified user login returns error=credentials
```

---

## Verification Steps

After completing remediation:

1. **GitHub Actions:** Release workflow shows ✅ SUCCESS for `deaf42f`
2. **GHCR:** `ghcr.io/applabx/postify:deaf42f` exists and is public
3. **Coolify:** Deploy triggered by webhook (not API)
4. **Production:** `/api/csrf/register` returns `{"csrfToken": "..."}`
5. **Production:** POST `/api/auth/register` without CSRF → 403
6. **Production:** Unverified user login → `error=credentials`
7. **Phase 8 QA:** Re-run blocked tests with verified deployment

---

## Blocking Issues Summary

| Issue | Severity | Status | Owner |
|---|---|---|---|
| Release workflow YAML syntax error (line 68) | **CRITICAL** | Fixing now | Mavis |
| No GHCR image for security fixes | **CRITICAL** | Waiting on Step 1 |
| No GitHub webhook on repo | **HIGH** | Manual fix needed | Gilbert |
| Coolify POST /start not pulling images | **MEDIUM** | Will self-resolve once webhook fires |
| Production running stale code | **HIGH** | Waiting on all above |

---

## What Code Is Actually Running in Production

**Commit approximately `cceb9b5` era** (2026-06-12 / before release workflow existed):
- Auth system ✅ (register, login, logout, forgot password)
- Email verification flow ✅
- Social account connections ✅ (LinkedIn, Meta, Twitter, Bluesky, Pinterest, Tumblr)
- Post scheduling ✅ (Bull/Redis)
- Compose UI, history, queue, analytics ✅
- **Missing:** D-01 emailVerified gate, D-02 CSRF on register, D-03 Redis rate limiting

**What needs to be deployed:**
- Commit `deaf42f` — all 3 security fixes + CSRF endpoint fix + middleware fix
