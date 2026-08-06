# OAuth Certification Harness

Every provider's OAuth implementation is verified in layers. Everything that
can be automated runs in `tests/oauth-certification.test.ts` (executed in CI).
Browser-interactive approval steps are documented below as manual procedures
that must be run once per provider configuration change (or per release, for
the platforms you ship).

## Automated coverage (CI, no browser)

| Check | Providers |
|---|---|
| Authorization URL base | LinkedIn, Meta, Twitter, Pinterest, Tumblr |
| `redirect_uri` = `NEXT_PUBLIC_APP_URL` + `/api/oauth/<p>/callback` | LinkedIn, Meta, Twitter, Pinterest |
| Exact scope set (LinkedIn: `openid profile email w_member_social` only) | LinkedIn |
| Required scopes present (pages/instagram/threads/boards/pins...) | Meta, Pinterest, Twitter |
| `state` present + opaque (16-byte hex) | all OAuth platforms |
| PKCE (`code_challenge` + `S256`) | Twitter |
| CSRF state cookie: valid / mismatched / missing / cross-platform | all |
| Callback handles `state_mismatch` and `denied` per provider | LinkedIn, Meta, Twitter, Pinterest, Tumblr |
| Redirects never use `req.url` (internal-host leak) | `tests/oauth-redirects.test.ts` |

## Manual browser steps (per provider, on approval changes)

1. **Prepare**: set `NEXT_PUBLIC_APP_URL` to the production URL; verify the
   provider app's registered redirect URI exactly matches
   `<APP_URL>/api/oauth/<platform>/callback`.
2. **Authorize**: open `/accounts` → Connect <Platform> → complete the
   provider's consent screen (approve the requested scopes).
3. **Verify success**: the callback returns to `/accounts?success=<platform>`
   with the account listed and `isActive=true`.
4. **Verify revocation**: revoke access in the provider console → reconnect →
   the app must show the reconnect prompt and `/api/health` remains healthy.
5. **Record**: note the provider app review state and any scope additions in
   this file (see table below).

## Provider-specific notes

| Platform | Grant type | Refresh | Notes |
|---|---|---|---|
| LinkedIn | OIDC + OAuth 2.0 | None (no `offline_access`; 60-day tokens) | Scope set is frozen — adding any scope breaks the whole request. Org/page posting requires LinkedIn app review for org scopes. |
| Facebook/Instagram/Threads | OAuth 2.0 + long-lived token | Yes (60-day) | Page tokens assumed independent of user token. |
| X/Twitter | OAuth 2.0 + PKCE | Yes (`offline.access`) | Requires Basic plan for write access. |
| Pinterest | OAuth 2.0 | Yes | Board selection at connect time. |
| Tumblr | OAuth 1.0a | n/a | Request-token flow + HMAC-SHA1 signing. |
| Bluesky | App password (not OAuth) | Yes (2h sessions) | Password encrypted at rest; refresh cron renews. |

## Runtime verification

```bash
# Auth URL + scopes actually emitted (logged per connect attempt):
grep OAUTH_START <coolify-logs>    # LinkedIn scope line
# Attempt metrics:
curl -s https://postify.applabx.com/api/metrics | grep oauth
# Failure events: Sentry → project Postify → tags: phase:oauth-*
```
