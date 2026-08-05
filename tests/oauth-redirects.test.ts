import { test } from 'node:test'
import assert from 'node:assert/strict'

// ─── Regression guard: OAuth redirect URLs ───────────────────────────────────
// Production must never generate http://0.0.0.0, localhost, or 127.0.0.1
// inside OAuth redirects. The Next.js standalone server builds req.url from
// the container's HOSTNAME/PORT (0.0.0.0:3000), so all redirects must come
// from NEXT_PUBLIC_APP_URL instead of req.url.

test('redirectTo() uses NEXT_PUBLIC_APP_URL and never internal hosts', async () => {
  const mod = await import('../lib/redirect-url')

  // Simulate production public URL
  process.env.NEXT_PUBLIC_APP_URL = 'https://postify.applabx.com'

  const cases = [
    '/login',
    '/accounts?error=linkedin_denied',
    '/accounts?success=linkedin',
    '/accounts/connect/linkedin?key=abc123',
  ]
  for (const path of cases) {
    const url = mod.redirectTo(path)
    assert.ok(url.startsWith('https://postify.applabx.com'), `expected public base, got ${url}`)
    assert.ok(!url.includes('0.0.0.0'), `0.0.0.0 leaked into redirect: ${url}`)
    assert.ok(!url.includes('localhost'), `localhost leaked into redirect: ${url}`)
    assert.ok(!url.includes('127.0.0.1'), `127.0.0.1 leaked into redirect: ${url}`)
    assert.ok(!url.includes(':3000'), `port leaked into redirect: ${url}`)
  }
})

test('redirectTo() falls back for local dev when env is unset', async () => {
  delete process.env.NEXT_PUBLIC_APP_URL
  const mod = await import('../lib/redirect-url')
  const url = mod.redirectTo('/login')
  assert.ok(url.startsWith('http://localhost:3000'), `expected local fallback, got ${url}`)
})

// ─── Regression guard: LinkedIn OAuth scopes ─────────────────────────────────
// w_member_social and offline_access are NOT provisioned on the production
// LinkedIn app. Requesting them makes LinkedIn reject the entire
// authorization request ("Bummer, something went wrong" + access_denied).
// Guard: the auth URL must never contain those scopes until they are
// provisioned and deliberately re-enabled.

test('LinkedIn auth URL uses only provisioned scopes', async () => {
  const { getLinkedInAuthUrl } = await import('../lib/oauth/linkedin')
  process.env.NEXT_PUBLIC_APP_URL = 'https://postify.applabx.com'
  process.env.LINKEDIN_CLIENT_ID = 'test-client-id'

  const url = getLinkedInAuthUrl('test-state')
  const decoded = decodeURIComponent(url)

  // Required: OIDC + org scopes that production is provisioned for
  for (const scope of ['openid', 'profile', 'email', 'r_organization_admin', 'w_organization_social']) {
    assert.ok(decoded.includes(scope), `missing scope ${scope} in ${decoded}`)
  }

  // Forbidden until approved: these break authorization
  assert.ok(!decoded.includes('w_member_social'), 'w_member_social must not be requested (not provisioned)')
  assert.ok(!decoded.includes('offline_access'), 'offline_access must not be requested (not provisioned)')

  // Redirect URI must use the public URL
  assert.ok(url.includes(encodeURIComponent('https://postify.applabx.com/api/oauth/linkedin/callback')),
    `redirect_uri must be the public callback: ${url}`)
  assert.ok(!url.includes('0.0.0.0'), 'internal host leaked into LinkedIn auth URL')
})
