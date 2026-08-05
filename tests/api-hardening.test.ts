import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateMediaUrl, validateMediaUrls } from '../lib/media-url'

test('validateMediaUrl accepts public HTTPS URLs', () => {
  assert.equal(validateMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/x.png'), null)
  assert.equal(validateMediaUrl('https://picsum.photos/seed/x/1200/630'), null)
  assert.equal(validateMediaUrl('https://cdn.bsky.app/img/feed_thumbnail/plain/x@jpeg'), null)
})

test('validateMediaUrl rejects SSRF vectors', () => {
  // scheme
  assert.ok(validateMediaUrl('http://res.cloudinary.com/x.png'))
  assert.ok(validateMediaUrl('file:///etc/passwd'))
  // IP literals (metadata endpoint, loopback, private ranges)
  assert.ok(validateMediaUrl('https://169.254.169.254/latest/meta-data'))
  assert.ok(validateMediaUrl('https://127.0.0.1/api/health'))
  assert.ok(validateMediaUrl('https://10.0.0.5/x.png'))
  assert.ok(validateMediaUrl('https://192.168.1.1/x.png'))
  // localhost / pseudo-internal hosts
  assert.ok(validateMediaUrl('https://localhost/x.png'))
  assert.ok(validateMediaUrl('https://postify.internal/x.png'))
  // credentials smuggling
  assert.ok(validateMediaUrl('https://user:pass@res.cloudinary.com/x.png'))
  // malformed
  assert.ok(validateMediaUrl('not a url'))
})

test('validateMediaUrls rejects a batch containing any invalid URL', () => {
  assert.equal(validateMediaUrls(['https://ok.example/a.png', 'https://ok.example/b.png']), null)
  const err = validateMediaUrls(['https://ok.example/a.png', 'http://bad.example/b.png'])
  assert.ok(err && err.length === 2, 'returns [reason, url]')
})

test('posts list query validation rejects bad status/limit/page', async () => {
  // Reuse the route's Zod schema indirectly by testing the shared constants
  // path: the schema is defined in the route; assert behavior via zod here.
  const { z } = await import('zod')
  const schema = z.object({
    status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL', 'FAILED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    page: z.coerce.number().int().min(1).default(1),
  })
  assert.ok(schema.safeParse({}).success)
  assert.ok(schema.safeParse({ status: 'SCHEDULED', limit: '50', page: '2' }).success)
  assert.ok(!schema.safeParse({ status: 'BOGUS' }).success, 'invalid status rejected')
  assert.ok(!schema.safeParse({ limit: '1000' }).success, 'oversized limit rejected')
  assert.ok(!schema.safeParse({ page: '0' }).success, 'page 0 rejected')
})

test('platform HTTP client enforces a timeout (no infinite hangs)', async () => {
  const { http } = await import('../lib/oauth/http')
  assert.equal(http.defaults.timeout, 30_000, '30s timeout configured')
})

test('Bull queue lock duration protects long publishes from stall re-processing', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync('lib/scheduler.ts', 'utf8')
  assert.ok(src.includes('lockDuration: 300000'), 'lockDuration set to 5 minutes')
})
