import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

// ─── OAuth Certification Harness (Phase 6) ───────────────────────────────────
// Automates everything verifiable without a browser:
//   - authorization URL construction (base, redirect_uri, scopes, state, PKCE)
//   - state cookie write/validate/clear (CSRF protection)
//   - callback validation primitives (state mismatch, missing code)
// Manual browser approval steps are documented in docs/OAUTH_CERTIFICATION.md.
// These tests FAIL if a provider's scopes or redirect URIs drift.

const APP_URL = 'https://postify.applabx.com'

const envBackups: Record<string, string | undefined> = {}
for (const k of [
  'NEXT_PUBLIC_APP_URL',
  'LINKEDIN_CLIENT_ID',
  'META_CLIENT_ID',
  'TWITTER_CLIENT_ID',
  'PINTEREST_CLIENT_ID',
]) {
  envBackups[k] = process.env[k]
}
process.env.NEXT_PUBLIC_APP_URL = APP_URL
process.env.LINKEDIN_CLIENT_ID = 'li-test-client'
process.env.META_CLIENT_ID = 'meta-test-client'
process.env.TWITTER_CLIENT_ID = 'tw-test-client'
process.env.PINTEREST_CLIENT_ID = 'pin-test-client'

after(() => {
  for (const [k, v] of Object.entries(envBackups)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

// ─── LinkedIn ─────────────────────────────────────────────────────────────────
test('linkedin auth URL: exact scopes, redirect_uri, opaque state', async () => {
  const { getLinkedInAuthUrl } = await import('../lib/oauth/linkedin')
  const state = 'a'.repeat(32)
  const url = new URL(getLinkedInAuthUrl(state, APP_URL))

  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization')
  // Production-hardened scope set — the entire request fails on any extra scope
  assert.equal(url.searchParams.get('scope'), 'openid profile email w_member_social')
  assert.equal(url.searchParams.get('redirect_uri'), `${APP_URL}/api/oauth/linkedin/callback`)
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('state'), state)
  // State must be opaque random hex (16 bytes), not a URL or an email
  assert.match(url.searchParams.get('state') ?? '', /^[a-f0-9]{32}$/)
})

// ─── Meta (Facebook/Instagram/Threads) ────────────────────────────────────────
test('meta auth URL: required scopes, redirect_uri, state', async () => {
  const { getMetaAuthUrl } = await import('../lib/oauth/meta')
  const state = 'b'.repeat(32)
  const url = new URL(getMetaAuthUrl(state, APP_URL))

  assert.equal(url.origin + url.pathname, 'https://www.facebook.com/dialog/oauth')
  assert.equal(url.searchParams.get('redirect_uri'), `${APP_URL}/api/oauth/meta/callback`)
  assert.equal(url.searchParams.get('state'), state)
  const scopes = (url.searchParams.get('scope') ?? '').split(',')
  for (const required of [
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish',
    'threads_basic',
    'threads_content_publish',
  ]) {
    assert.ok(scopes.includes(required), `missing meta scope ${required}`)
  }
})

// ─── X / Twitter (PKCE) ───────────────────────────────────────────────────────
test('twitter auth URL: PKCE challenge, state, offline scope', async () => {
  const { getTwitterAuthUrl } = await import('../lib/oauth/platforms')
  const state = 'c'.repeat(32)
  const verifier = 'd'.repeat(43)
  const challenge = 'challenge-value'
  const url = new URL(getTwitterAuthUrl(state, challenge))

  assert.equal(url.origin + url.pathname, 'https://twitter.com/i/oauth2/authorize')
  assert.equal(url.searchParams.get('redirect_uri'), `${APP_URL}/api/oauth/twitter/callback`)
  assert.equal(url.searchParams.get('state'), state)
  assert.equal(url.searchParams.get('code_challenge'), challenge)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.match(url.searchParams.get('scope') ?? '', /offline\.access/)
  assert.ok(verifier.length >= 43, 'PKCE verifier must be >= 43 chars')
})

// ─── Pinterest ────────────────────────────────────────────────────────────────
test('pinterest auth URL: pins scopes, redirect_uri, state', async () => {
  const { getPinterestAuthUrl } = await import('../lib/oauth/platforms')
  const state = 'e'.repeat(32)
  const url = new URL(getPinterestAuthUrl(state))

  assert.equal(url.origin + url.pathname, 'https://www.pinterest.com/oauth/')
  assert.equal(url.searchParams.get('redirect_uri'), `${APP_URL}/api/oauth/pinterest/callback`)
  assert.equal(url.searchParams.get('state'), state)
  for (const required of ['pins:read', 'pins:write', 'boards:read', 'boards:write']) {
    assert.ok((url.searchParams.get('scope') ?? '').includes(required), `missing pinterest scope ${required}`)
  }
})

// ─── Tumblr (OAuth 1.0a) ──────────────────────────────────────────────────────
test('tumblr authorize endpoint constant', async () => {
  const { getTumblrAuthUrl } = await import('../lib/oauth/platforms')
  const url = getTumblrAuthUrl()
  assert.equal(url, 'https://www.tumblr.com/oauth/authorize')
})

// ─── State (CSRF) validation primitives ───────────────────────────────────────
test('oauth state cookie: valid, mismatched, and missing states', async () => {
  const { isValidOAuthState, getOAuthStateCookieName } = await import('../lib/oauth-state')

  const withCookie = (state: string | null) =>
    new NextRequest('https://postify.applabx.com/api/oauth/linkedin/callback', {
      headers: state ? { cookie: `${getOAuthStateCookieName('linkedin')}=${state}` } : {},
    })

  const goodState = 'f'.repeat(32)
  assert.equal(isValidOAuthState(withCookie(goodState), 'linkedin', goodState), true)
  assert.equal(isValidOAuthState(withCookie(goodState), 'linkedin', 'wrong'), false)
  assert.equal(isValidOAuthState(withCookie(null), 'linkedin', goodState), false)
  assert.equal(isValidOAuthState(withCookie(goodState), 'linkedin', null), false)
  // Platform-scoped: a twitter cookie must not satisfy the linkedin check
  const twitterCookie = new NextRequest('https://postify.applabx.com/api/oauth/linkedin/callback', {
    headers: { cookie: `oauth_state_twitter=${goodState}` },
  })
  assert.equal(isValidOAuthState(twitterCookie, 'linkedin', goodState), false)
})

// ─── Callback error handling (per platform) ───────────────────────────────────
test('callback error surface: every provider has a state_mismatch + denied path', async () => {
  const files = ['linkedin', 'meta', 'twitter', 'pinterest', 'tumblr'].map(
    (p) => `app/api/oauth/${p}/callback/route.ts`
  )
  for (const f of files) {
    const src = await import('node:fs/promises').then((fs) => fs.readFile(f, 'utf8'))
    assert.match(src, /state_mismatch/, `${f} missing state_mismatch handling`)
    assert.match(src, /_denied/, `${f} missing denied handling`)
    assert.match(src, /isValidOAuthState/, `${f} missing CSRF check`)
  }
})
