# Postify Authentication Fix — Deployment Checklist

## What Changed

### Root Cause
`devAuthEnabled` and `usePrismaAdapter` in `lib/auth.ts` were module-level `const`s evaluated once at Docker image build time. The Docker build stage doesn't have access to Coolify's runtime `environment:` vars, so `devAuthEnabled` was baked in as `false` → credentials provider returned empty array → every sign-in rejected.

**Fix**: Moved all env-var evaluation inside the `authorize()` function body so they're read fresh at **request time** (runtime), not at build time.

### New Files
| File | Purpose |
|---|---|
| `lib/email.ts` | SMTP email sender + email templates |
| `app/api/auth/register/route.ts` | POST — register new user |
| `app/api/auth/forgot-password/route.ts` | POST — send password reset email |
| `app/api/auth/reset-password/route.ts` | POST — reset password with token |
| `app/api/auth/verify-email/route.ts` | GET — verify email, activate account |
| `app/register/page.tsx` | Register page |
| `app/forgot-password/page.tsx` | Forgot password page |
| `app/reset-password/page.tsx` | Reset password page |

### Changed Files
| File | Change |
|---|---|
| `lib/auth.ts` | Root cause fix + real credentials auth + rate limiting + brute-force protection |
| `prisma/schema.prisma` | Added: passwordHash, emailVerificationToken, emailVerified, resetToken, resetTokenExpiry, failedLoginAttempts, lockedUntil |
| `app/login/page.tsx` | Full email+password form with show/hide, forgot password link, better errors |
| `app/sidebar-nav.tsx` | User name/email display, signOut button, active nav highlight |
| `docker-compose.yaml` | Cleaned up `env_file` reference (was pointing to gitignored file) |
| `.env.example` | Added SMTP vars + AUTH_USE_PRISMA_ADAPTER |
| `package.json` | Added: bcryptjs, nodemailer, @types/bcryptjs, @types/nodemailer |

---

## Deployment Steps

### Step 1: Trigger Coolify Redeploy

**Option A — Via Coolify UI:**
1. Open https://cloud.applabx.com (or your Coolify instance)
2. Navigate to Postify app → Deployments
3. Click "Deploy" (it will pull the latest `master` commit)

**Option B — Via API:**
```bash
curl -X POST "https://coolify.applabx.com/api/v1/deploy" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uuid":"eehzi4dz98bay175wko3wqut"}'
```

### Step 2: Push Prisma Schema to Neon DB

After the container starts, run:
```bash
# Option A: via npx (from the repo)
cd /Users/gilbertneo/Desktop/My\ Apps/postify
npx prisma db push --accept-data-loss

# Option B: directly via psql (Neon connection string from Coolify)
# Connect to Neon and run the schema changes manually
```

Or from inside the container:
```bash
docker exec -it <container_id> npx prisma db push --accept-data-loss
```

> ⚠️ `--accept-data-loss` is needed because new optional fields are added to an existing table. No data will be lost.

### Step 3: Verify Deployment

```bash
# Check container logs
curl -s "https://coolify.applabx.com/api/v1/applications/eehzi4dz98bay175wko3wqut/logs" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | tail -30

# Check health
curl -s "https://postify.applabx.com/api/health"

# Check providers are registered
curl -s "https://postify.applabx.com/api/auth/providers"
# Should show: {"credentials":{"id":"credentials",...}}
```

### Step 4: Smoke Test

1. **Register**: Visit `https://postify.applabx.com/register`
   - Fill in name, email, password (min 8 chars)
   - Should show "Check your email to verify your account"
   - (If SMTP not configured: check container logs for the verification link)

2. **Login**: Visit `https://postify.applabx.com/login`
   - Sign in with registered email + password
   - Should redirect to `/compose`

3. **Forgot Password**: Visit `https://postify.applabx.com/forgot-password`
   - Enter email → should show success message
   - (Check container logs for reset link if SMTP not configured)

4. **Reset Password**: Click reset link → should redirect to reset page
   - Enter new password → should redirect to login

5. **Dev Mode** (if ENABLE_DEV_AUTH=true still set):
   - Use any email + password `dev` to bypass authentication

---

## Environment Variables in Coolify

These should already be set. Verify in Coolify dashboard → Postify → Environment:

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL URL | ✅ |
| `REDIS_URL` | Coolify Redis URL | ✅ |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | ✅ |
| `NEXTAUTH_URL` | `https://postify.applabx.com` | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://postify.applabx.com` | ✅ |
| `ENABLE_DEV_AUTH` | `true` (dev bypass) | ✅ |
| `AUTH_USE_PRISMA_ADAPTER` | `false` (use JWT sessions) | ✅ |
| `TOKEN_ENCRYPTION_KEY` | Encryption key | ✅ |
| `CRON_SECRET` | Random secret | ✅ |

### Optional (for email sending)
| Variable | Value |
|---|---|
| `SMTP_HOST` | e.g. `smtp.postmarkapp.com` |
| `SMTP_PORT` | `587` (TLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | `Postify <noreply@postify.app>` |

> **Without SMTP configured**: Verification and reset emails are logged to the container console. Check logs to get the actual links.

---

## Troubleshooting

### Login still fails with "Sign-in was rejected"
1. Check container logs for `[Auth]` prefixed messages
2. Verify `ENABLE_DEV_AUTH=true` is set in Coolify env vars
3. Verify `NEXTAUTH_SECRET` has a non-empty value
4. Try dev bypass: email = `test@postify.com`, password = `dev`

### Prisma errors (table not found)
```bash
docker exec <container_id> npx prisma db push --accept-data-loss
```

### CSRF errors
- Ensure `NEXTAUTH_URL` matches exactly (including https)
- Clear browser cookies for postify.applabx.com and retry

### Rate limited
- Wait 15 minutes for the rate limit window to reset
- Rate limit is 20 attempts per IP+email per 15 minutes
