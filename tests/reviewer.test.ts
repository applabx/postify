import { test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import {
  seedReviewerAccount,
  REVIEWER_EMAIL,
  REVIEWER_NAME,
  REVIEWER_WORKSPACE,
} from '../lib/reviewer-seed'

test('reviewer seed is idempotent — no duplicate user, posts, or accounts', async () => {
  // Hermetic: clear the reviewer's demo data first so counts are deterministic
  const existing = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })
  if (existing) {
    await prisma.postTarget.deleteMany({ where: { post: { userId: existing.id } } })
    await prisma.post.deleteMany({ where: { userId: existing.id } })
    await prisma.socialAccount.deleteMany({ where: { userId: existing.id } })
  }

  // Run the seed twice; the second run must not create duplicates
  const first = await seedReviewerAccount()
  const second = await seedReviewerAccount()

  assert.equal(first.userId, second.userId, 'same user id across runs')

  const users = await prisma.user.findMany({ where: { email: REVIEWER_EMAIL } })
  assert.equal(users.length, 1, 'exactly one reviewer user')

  const posts = await prisma.post.count({ where: { userId: first.userId } })
  const accounts = await prisma.socialAccount.count({ where: { userId: first.userId } })
  assert.equal(posts, first.demoPosts, 'post count matches first-run count')
  assert.ok(posts > 0, 'demo posts exist')
  assert.ok(accounts > 0, 'demo accounts exist')

  // Role + identity
  const user = users[0]
  assert.equal(user.role, 'REVIEWER')
  assert.equal(user.name, REVIEWER_NAME)
  assert.ok(user.emailVerified, 'reviewer email pre-verified')
})

test('reviewer seed password verifies with bcrypt and rotates on re-run', async () => {
  const first = await seedReviewerAccount()
  const user = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })
  assert.ok(user?.passwordHash, 'password hash stored')
  assert.equal(await bcrypt.compare(first.password, user!.passwordHash!), true,
    'returned password matches stored hash')

  const second = await seedReviewerAccount()
  const user2 = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })
  assert.notEqual(first.password, second.password, 'password rotates on re-run')
  assert.equal(await bcrypt.compare(second.password, user2!.passwordHash!), true,
    'new password matches stored hash')
})

test('demo workspace contains realistic sample content', async () => {
  const seeded = await seedReviewerAccount()
  const posts = await prisma.post.findMany({ where: { userId: seeded.userId } })
  const texts = posts.map(p => p.text)

  assert.ok(texts.some(t => t.toLowerCase().includes('product launch')), 'product launch post')
  assert.ok(texts.some(t => t.toLowerCase().includes('hiring')), 'hiring post')
  assert.ok(texts.some(t => t.toLowerCase().includes('blog')), 'blog article post')
  assert.ok(texts.some(t => t.toLowerCase().includes('marketing announcement')), 'marketing post')

  const statuses = new Set(posts.map(p => p.status))
  assert.ok(statuses.has('PUBLISHED'), 'published history present')
  assert.ok(statuses.has('SCHEDULED'), 'scheduled queue present')
  assert.ok(statuses.has('PARTIAL'), 'partial/failed history present')

  const withMedia = posts.filter(p => p.mediaUrls.length > 0)
  assert.ok(withMedia.length > 0, 'sample media present')

  const targets = await prisma.postTarget.findMany({
    where: { post: { userId: seeded.userId } },
  })
  assert.ok(targets.some(t => t.status === 'SUCCESS'), 'successful target present')
  assert.ok(targets.some(t => t.status === 'FAILED'), 'failed target present')

  assert.equal(REVIEWER_WORKSPACE, 'LinkedIn API Review')
})

test('forgot-password flow can never issue a reset token for the reviewer account', async () => {
  await seedReviewerAccount()
  const { reviewerResetBlocked } = await import('../lib/authz')

  // Pure guard used by the forgot-password and reset-password routes
  assert.equal(reviewerResetBlocked({ role: 'REVIEWER', email: 'x@y.z' }), true, 'role-based block')
  assert.equal(reviewerResetBlocked({ role: 'USER', email: REVIEWER_EMAIL }), true, 'email-based block')
  assert.equal(reviewerResetBlocked({ role: 'USER', email: 'someone@else.com' }), false, 'normal users unaffected')
  assert.equal(reviewerResetBlocked(null), false, 'missing user unaffected')

  // DB invariant: the reviewer account must never carry a reset token/expiry
  const user = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })
  assert.equal(user?.resetToken, null, 'no reset token present')
  assert.equal(user?.resetTokenExpiry, null, 'no reset expiry present')
})

test('reviewer login credentials are valid against the stored hash', async () => {
  const seeded = await seedReviewerAccount()
  const user = await prisma.user.findUnique({ where: { email: REVIEWER_EMAIL } })
  assert.ok(user)
  assert.equal(user.role, 'REVIEWER')
  // NextAuth would call bcrypt.compare with the submitted password; simulate it
  assert.equal(await bcrypt.compare(seeded.password, user.passwordHash!), true,
    'submitted password authenticates')
})
