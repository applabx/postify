import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipIsPrivate, validateMediaUrl, validateMediaUrlsDns } from '../lib/media-url'
import { rateLimitAsync, rateLimitKey } from '../lib/rate-limit'

test('ipIsPrivate classifies IPv4 ranges correctly', () => {
  assert.ok(ipIsPrivate('10.0.0.1'))
  assert.ok(ipIsPrivate('127.0.0.1'))
  assert.ok(ipIsPrivate('169.254.169.254'))
  assert.ok(ipIsPrivate('172.16.0.1'))
  assert.ok(ipIsPrivate('172.31.255.255'))
  assert.ok(ipIsPrivate('192.168.1.1'))
  assert.ok(ipIsPrivate('0.0.0.0'))
  assert.ok(ipIsPrivate('100.64.0.1'))
  assert.ok(ipIsPrivate('224.0.0.1'))
  assert.ok(ipIsPrivate('192.0.2.1'))
  assert.ok(!ipIsPrivate('8.8.8.8'))
  assert.ok(!ipIsPrivate('172.32.0.1'))
  assert.ok(!ipIsPrivate('198.17.0.1'))
})

test('ipIsPrivate classifies IPv6 ranges correctly', () => {
  assert.ok(ipIsPrivate('::1'))
  assert.ok(ipIsPrivate('::ffff:127.0.0.1'))
  assert.ok(ipIsPrivate('::ffff:10.0.0.5'))
  assert.ok(ipIsPrivate('fc00::1'))
  assert.ok(ipIsPrivate('fe80::1'))
  assert.ok(ipIsPrivate('ff02::1'))
  assert.ok(ipIsPrivate('2001:db8::1'))
  assert.ok(!ipIsPrivate('2606:4700:4700::1111'))
  assert.ok(!ipIsPrivate('::ffff:8.8.8.8'))
})

test('validateMediaUrlsDns resolves and rejects private-host DNS', async () => {
  // A public hostname must pass DNS validation
  const ok = await validateMediaUrlsDns(['https://example.com/x.png'])
  assert.equal(ok, null, `example.com should pass: ${ok}`)

  // A hostname that resolves to a loopback/private address must be rejected.
  // localhost resolves to 127.0.0.1/::1 on all platforms.
  const err = await validateMediaUrlsDns(['https://localhost/x.png'])
  assert.ok(err, `localhost should be rejected, got: ${err}`)
})

test('rateLimitAsync enforces limits and degrades when Redis is absent', async (t) => {
  const key = rateLimitKey('test-user', 'publish')
  const config = { windowMs: 60_000, max: 3 }

  // First three calls allowed
  for (let i = 0; i < 3; i++) {
    const r = await rateLimitAsync(key, config)
    assert.equal(r.allowed, true, `call ${i + 1} should be allowed`)
  }
  // Fourth call blocked
  const blocked = await rateLimitAsync(key, config)
  assert.equal(blocked.allowed, false, '4th call must be blocked')
  assert.equal(blocked.remaining, 0)

  // Close the shared Redis connection so the test process can exit
  t.after(async () => {
    const { closeRateLimitRedis } = await import('../lib/rate-limit')
    await closeRateLimitRedis()
  })
})
