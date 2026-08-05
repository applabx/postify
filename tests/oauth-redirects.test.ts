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

test('LinkedIn auth URL requests EXACTLY the authorized scopes', async () => {
  const { getLinkedInAuthUrl } = await import('../lib/oauth/linkedin')
  process.env.NEXT_PUBLIC_APP_URL = 'https://postify.applabx.com'
  process.env.LINKEDIN_CLIENT_ID = 'test-client-id'

  const url = getLinkedInAuthUrl('test-state')
  const params = new URL(url).searchParams
  const scope = params.get('scope')

  // Exact scope string — verified against the LinkedIn Developer Console and
  // LinkedIn's authorization endpoint (openid profile email w_member_social
  // -> "Authorize" page; any other scope -> unauthorized/invalid_scope_error)
  assert.equal(scope, 'openid profile email w_member_social',
    `scope must be exactly "openid profile email w_member_social", got "${scope}"`)

  // Hard-fail on every unauthorized scope, even if embedded
  for (const forbidden of ['r_organization_admin', 'w_organization_social', 'offline_access']) {
    assert.ok(!scope?.includes(forbidden), `unauthorized scope ${forbidden} present in ${scope}`)
  }

  // Redirect URI must use the public URL
  assert.equal(params.get('redirect_uri'), 'https://postify.applabx.com/api/oauth/linkedin/callback',
    `redirect_uri must be the public callback: ${params.get('redirect_uri')}`)
  assert.equal(params.get('response_type'), 'code')
  assert.ok(params.get('state'), 'state must be present')
  assert.ok(!url.includes('0.0.0.0'), 'internal host leaked into LinkedIn auth URL')
})

test('public redirect routes (verify-email, oauth callbacks) cannot emit internal hosts', async () => {
  const { redirectTo } = await import('../lib/redirect-url')
  process.env.NEXT_PUBLIC_APP_URL = 'https://postify.applabx.com'

  // The exact redirect targets these routes produce for error/edge cases
  const targets = [
    redirectTo('/login?error=verification_failed'),
    redirectTo('/login?verified=1'),
    redirectTo('/accounts?error=linkedin_denied'),
    redirectTo('/accounts?error=linkedin_state_mismatch'),
    redirectTo('/accounts?error=linkedin_failed'),
    redirectTo('/accounts?success=linkedin'),
  ]
  for (const t of targets) {
    assert.ok(t.startsWith('https://postify.applabx.com'), `wrong base: ${t}`)
    assert.ok(!t.includes('0.0.0.0') && !t.includes('localhost') && !t.includes('127.0.0.1'),
      `internal host leaked: ${t}`)
  }
})

test('validateEnv rejects internal-host NEXT_PUBLIC_APP_URL (runtime misconfiguration guard)', async () => {
  // Load env module fresh so module-level validation does not interfere
  const { validateEnv } = await import('../lib/env')

  const backups: Record<string, string | undefined> = {}
  for (const k of ['NEXT_PUBLIC_APP_URL', 'DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'TOKEN_ENCRYPTION_KEY', 'CRON_SECRET', 'NODE_ENV']) {
    backups[k] = process.env[k]
  }
  try {
    // Provide all required vars so the URL-value checks are exercised
    process.env.DATABASE_URL = 'postgresql://x:x@localhost:5432/x'
    process.env.NEXTAUTH_URL = 'https://postify.applabx.com'
    process.env.NEXTAUTH_SECRET = 'test'
    process.env.TOKEN_ENCRYPTION_KEY = 'test'
    process.env.CRON_SECRET = 'test'
    process.env.NODE_ENV = 'production'

    // Must NOT throw for the correct public URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://postify.applabx.com'
    validateEnv()

    // Must throw for internal hosts — the exact production failure mode
    for (const bad of ['https://0.0.0.0:3000', 'http://localhost:3000', 'http://127.0.0.1:3000']) {
      process.env.NEXT_PUBLIC_APP_URL = bad
      assert.throws(() => validateEnv(), new RegExp('NEXT_PUBLIC_APP_URL'), `expected throw for ${bad}`)
    }

    // Must throw for non-https in production
    process.env.NEXT_PUBLIC_APP_URL = 'http://postify.applabx.com'
    assert.throws(() => validateEnv(), new RegExp('https'), 'expected https requirement in production')
  } finally {
    for (const [k, v] of Object.entries(backups)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})
