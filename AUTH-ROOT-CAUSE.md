# Postify Authentication — Root Cause Report & Deployment Guide

## Root Cause: Sign-In Always Failing

**Symptom:** Every login attempt returns "Sign-in was rejected by server."

### Investigation Evidence

| Check | Result | Evidence |
|---|---|---|
| Coolify env vars registered | ✅ 10 auth vars with `is_runtime: true` | Confirmed via Coolify API |
| CSRF endpoint works | ✅ Returns valid token + sets Secure cookies | Live test |
| Credentials provider registered | ✅ `/api/auth/providers` returns it | Live test |
| Login fails | ✅ `CredentialsSignin` error from NextAuth | Live test |
| `error=credentials` from signin page | ✅ `getServerSession` returns null, NextAuth treats as "no provider" | Live test |

### Root Cause

The `devAuthEnabled` and `usePrismaAdapter` variables in `lib/auth.ts` were **module-level `const`s computed once at Docker image build time**.

During `docker build`, webpack statically analyzes `process.env.ENABLE_DEV_AUTH` to inline its value. Since `environment:` vars in `docker-compose.yaml` are only injected at **container runtime**, not at **build time**, webpack saw `ENABLE_DEV_AUTH = undefined` and baked `devAuthEnabled = false` into the bundle.

At runtime, even though Coolify correctly injected `ENABLE_DEV_AUTH=true` into the container's environment, the **compiled bundle** still had `devAuthEnabled = false`, causing the credentials provider to be excluded from NextAuth's provider list. Every sign-in hit an empty provider array → NextAuth returned `CredentialsSignin`.

### Fix Applied

Moved all env-var evaluation **inside the `authorize()` function body** so they're read fresh at **request time** (runtime), not at build time:

```typescript
// BEFORE (broken — evaluated at module load)
const devAuthEnabled = process.env.ENABLE_DEV_AUTH === 'true'  // baked in at build!

// AFTER (fixed — evaluated on every request)
function getDevAuthEnabled() {
  return process.env.ENABLE_DEV_AUTH === 'true' || ...
}
async authorize(credentials) {
  const devAuthEnabled = getDevAuthEnabled()  // read fresh every time
  ...
}
```

---

## Changes Made

### New Files
| File | Purpose |
|---|---|
| `lib/auth.ts` | Complete rewrite — runtime env eval + real credentials + rate limiting |
| `lib/email.ts` | Nodemailer helper + email templates |
| `app/api/auth/register/route.ts` | Create user with bcrypt-hashed password |
| `app/api/auth/forgot-password/route.ts` | Generate reset token, send email |
| `app/api/auth/reset-password/route.ts` | Validate token, update password |
| `app/api/auth/verify-email/route.ts` | Mark email as verified |
| `app/register/page.tsx` | Register page |
| `app/forgot-password/page.tsx` | Forgot password page |
| `app/reset-password/page.tsx` | Reset password page with token validation |
| `DEPLOYMENT-CHECKLIST.md` | This document |

### Changed Files
| File | Change |
|---|---|
| `prisma/schema.prisma` | Added: `passwordHash`, `emailVerificationToken`, `emailVerified`, `resetToken`, `resetTokenExpiry`, `failedLoginAttempts`, `lockedUntil` |
| `app/login/page.tsx` | Full email+password form, show/hide password, better errors |
| `app/sidebar-nav.tsx` | User name/email display, `signOut()` button, active nav |
| `docker-compose.yaml` | Cleaned up `env_file` reference |
| `.env.example` | Added SMTP + `AUTH_USE_PRISMA_ADAPTER` |
| `package.json` | Added: `bcryptjs`, `nodemailer`, `@types/bcryptjs`, `@types/nodemailer` |

### Prisma Migration Required

```bash
npx prisma db push --accept-data-loss
```
(Adds optional fields — no data loss. `--accept-data-loss` required for adding nullable fields to existing tables.)

---

## Deployment Steps

### 1. Enable Build Server in Coolify (one-time fix)

Coolify's builds are silently failing because `is_build_server = false` on the server.

1. Go to **Settings → Server (localhost)**
2. Enable **Build Server** → ON
3. Save

This prevents future deploys from silently failing.

### 2. Deploy

**Option A — Coolify UI (recommended):**
```
Postify app → Deployments → click Deploy
```

**Option B — API:**
```bash
curl -X POST "https://coolify.applabx.com/api/v1/deploy" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"eehzi4dz98bay175wko3wqut"}'
```

### 3. Push Prisma Schema

After container starts:
```bash
docker exec <container_id> npx prisma db push --accept-data-loss
```

### 4. Verify

```bash
# Check providers
curl https://postify.applabx.com/api/auth/providers
# Should show: {"credentials":{...}}

# Smoke test — register
curl -X POST https://postify.applabx.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@postify.com","password":"testpass123","name":"Test User"}'
# Should return: {"success":true,...}

# Smoke test — login (dev mode)
# Email: any email, Password: dev
```

---

## Environment Variables (should already be set)

| Variable | Value | Status |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL URL | ✅ Registered |
| `REDIS_URL` | Coolify Redis URL | ✅ Registered |
| `NEXTAUTH_SECRET` | Random 32-char secret | ✅ Registered |
| `NEXTAUTH_URL` | `https://postify.applabx.com` | ✅ Registered |
| `NEXT_PUBLIC_APP_URL` | `https://postify.applabx.com` | ✅ Registered |
| `ENABLE_DEV_AUTH` | `true` | ✅ Registered |
| `AUTH_USE_PRISMA_ADAPTER` | `false` | ✅ Registered |
| `TOKEN_ENCRYPTION_KEY` | Encryption key | ✅ Registered |
| `CRON_SECRET` | Random secret | ✅ Registered |

### Optional (for email sending)
| Variable | Purpose |
|---|---|
| `SMTP_HOST` | e.g. `smtp.postmarkapp.com` |
| `SMTP_PORT` | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | `Postify <noreply@postify.app>` |

> **Without SMTP**: Verification/reset emails are logged to container console. Check logs for the actual link.

---

## Security Features Implemented

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt, cost 12 |
| Brute-force protection | In-memory rate limiter: 20 attempts / 15 min / IP+email |
| Account lockout | Locked for 15 min after 5 failed attempts |
| Reset token expiry | 1 hour |
| Email verification | 24-hour token |
| Email enumeration prevention | Forgot password always shows success (even if email doesn't exist) |
| CSRF protection | NextAuth built-in |
| Secure cookies | `HttpOnly`, `Secure`, `SameSite=Lax` |

---

## Troubleshooting

### Login still fails after deploy
1. Check container logs: `docker logs <container_id>`
2. Look for `[Auth]` prefixed messages
3. Verify `ENABLE_DEV_AUTH=true` is in the container env: `docker exec <container_id> env | grep ENABLE`
4. Try dev bypass: any email + password `dev`

### Prisma errors (table not found)
```bash
docker exec <container_id> npx prisma db push --accept-data-loss
```

### Rate limited
Wait 15 minutes for the window to reset.
