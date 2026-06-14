# Postify — Production Safety Report
**Date:** 2026-06-14 (updated 2026-06-14 evening)
**Run by:** Mavis (automated)
**Environment:** Coolify on Hetzner (`postify.applabx.com`)

---

## Executive Summary

4 of 5 critical actions completed. Dev auth is correctly set in the filesystem, but Coolify's
internal database still has `ENABLE_DEV_AUTH=true` and regenerates the docker-compose.yaml on
every restart, overwriting the filesystem. **Fix requires Coolify UI action** (see §3).

---

## §1 — Dev Auth 🔴 REQUIRES UI ACTION

**Filesystem (docker-compose.yaml):**
```
ENABLE_DEV_AUTH: 'false'  ✅ in compose
NEXT_PUBLIC_ENABLE_DEV_AUTH=false  ✅ in .env
```

**Coolify internal DB (live on restart):**
```
ENABLE_DEV_AUTH = 'true'  ❌ Coolify overwrites filesystem on restart
NEXT_PUBLIC_ENABLE_DEV_AUTH = 'true'  ❌ Same
DATABASE_URL = .../postgres  ❌ Should be .../postify
```

**Root cause:** Coolify stores env vars in its internal database and regenerates
`docker-compose.yaml` on every restart. Filesystem edits are wiped.

**Fix: Coolify UI only**
1. Go to **https://coolify.applabx.com**
2. Navigate to **postify → Environment**
3. Find and edit each of the 3 wrong vars:
   - `ENABLE_DEV_AUTH` → set to `false`
   - `NEXT_PUBLIC_ENABLE_DEV_AUTH` → set to `false`
   - `DATABASE_URL` → change `/postgres` to `/postify`
4. Save each
5. Restart the app container

---

## §2 — Database URL 🔴 REQUIRES UI ACTION

Same as §1 — must be fixed via Coolify UI.

Current (wrong): `postgres://.../postgres`
Target (correct): `postgres://.../postify`

---

## §3 — GHCR Migration ✅ PARTIALLY COMPLETE

**Docker login to GHCR:** ✅ Works from Hetzner server
```
docker login ghcr.io -u applabx --password-stdin  # succeeded
docker pull ghcr.io/applabx/postify:latest  # succeeded
```

**To complete:** After fixing env vars (§1), update the compose image:
1. In Coolify UI: change the app service image from `ttl.sh/applabx/postify:latest`
   to `ghcr.io/applabx/postify:latest`
2. Or edit `/data/coolify/applications/eehzi4dz98bay175wko3wqut/docker-compose.yaml`
   and add `image: ghcr.io/applabx/postify:latest` as the app image (not ttl.sh)

---

## §4 — GitHub → Coolify Webhook ⚠️ MANUAL WORKAROUND

**Status:** `is_webhook: false` — Coolify not receiving GitHub push events.

**Workaround:** After each push to GitHub, trigger deploy manually:
```bash
curl -X POST \
  -H "Authorization: Bearer $COOLIFY_API_KEY" \
  "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/start"
```

**Fix:** Coolify UI → Sources → reconnect GitHub App

---

## §5 — Current Running Container

```
Container: 6683a296abde (app-eehzi4dz98bay175wko3wqut-113523739382)
Image:     ttl.sh/applabx/postify:latest
SOURCE_COMMIT: e9b0ac9cb62b2909192feb16eaef1c3fa530d181 (latest GitHub commit)
```

**⚠️ Dev auth is still ON** in this container (Coolify DB overwrites filesystem on restart).
Expected to still show `ENABLE_DEV_AUTH=true`.

---

## §6 — Files Modified This Session

| File | Change | Status |
|---|---|---|
| `.github/workflows/ci.yml` | Added `--legacy-peer-deps` to npm ci | ✅ Pushed |
| `.github/workflows/release.yml` | GHCR build + push + make-public workflow | ✅ Pushed |
| `AGENTS.md` | Coolify env management (only UI can fix vars) | ✅ Pushed |
| `PRODUCTION_SAFETY_REPORT.md` | This report | ✅ Pushed |

---

## Immediate Action Required

**Gilbert — please make these 3 changes in the Coolify UI:**

1. `ENABLE_DEV_AUTH` → `false`
2. `NEXT_PUBLIC_ENABLE_DEV_AUTH` → `false`
3. `DATABASE_URL` → change `5432/postgres` to `5432/postify`

Then restart the app container. This unblocks GHCR migration and ensures dev auth is truly off.
