import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const REVIEWER_EMAIL = 'linkedin-review@postify.applabx.com'
export const REVIEWER_NAME = 'LinkedIn API Review'
export const REVIEWER_WORKSPACE = 'LinkedIn API Review'
export const REVIEWER_PASSWORD_LENGTH = 24

export interface ReviewerSeedResult {
  email: string
  password: string
  created: boolean
  userId: string
  demoPosts: number
  demoAccounts: number
}

function generatePassword(): string {
  // URL-safe strong random password (24 chars, ~143 bits of entropy)
  return crypto.randomBytes(18).toString('base64url')
}

// ─── Demo content fixtures ───────────────────────────────────────────────────
const DEMO_ACCOUNTS = [
  {
    platform: 'LINKEDIN' as const,
    accountType: 'PERSONAL' as const,
    externalId: 'demo-li-personal',
    name: 'LinkedIn Demo Profile',
    handle: 'demo-profile',
    accessToken: 'demo-token-do-not-use',
    tokenExpiry: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  },
  {
    platform: 'TWITTER' as const,
    accountType: 'PERSONAL' as const,
    externalId: 'demo-twitter',
    name: 'Demo Company (X)',
    handle: 'democompany',
    accessToken: 'demo-token-do-not-use',
    tokenExpiry: new Date(Date.now() + 90 * 24 * 3600 * 1000),
  },
]

interface DemoTarget {
  socialAccountName: string
  status: 'SUCCESS' | 'FAILED' | 'PENDING'
  externalPostId?: string
  errorMessage?: string
}

interface DemoPost {
  text: string
  mediaUrls: string[]
  status: 'PUBLISHED' | 'PARTIAL' | 'SCHEDULED'
  publishedAt?: Date
  scheduledAt?: Date
  targets: DemoTarget[]
}

const DEMO_POSTS: DemoPost[] = [
  {
    text: '🚀 Exciting news! Our new product launch is here. Read more about what we built and why it matters: https://example.com/launch',
    mediaUrls: ['https://picsum.photos/seed/postify-launch/1200/630'],
    status: 'PUBLISHED' as const,
    publishedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'SUCCESS', externalPostId: 'urn:li:share:7000000000000000001' },
      { socialAccountName: 'Demo Company (X)', status: 'SUCCESS', externalPostId: '1780000000000000001' },
    ],
  },
  {
    text: 'We are hiring! Join our team as a Senior Product Engineer. Remote-friendly, competitive salary, and a team that ships. Apply: https://example.com/careers',
    mediaUrls: [],
    status: 'PUBLISHED' as const,
    publishedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'SUCCESS', externalPostId: 'urn:li:share:7000000000000000002' },
    ],
  },
  {
    text: 'New on the blog: "Scaling social publishing without the chaos" — how we built Postify to make multi-platform publishing boring and reliable. https://example.com/blog/scaling-social',
    mediaUrls: ['https://picsum.photos/seed/postify-blog/1200/630'],
    status: 'PUBLISHED' as const,
    publishedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'SUCCESS', externalPostId: 'urn:li:share:7000000000000000003' },
      { socialAccountName: 'Demo Company (X)', status: 'FAILED', errorMessage: 'Request failed with status code 401 (demo token)' },
    ],
  },
  {
    text: 'Marketing announcement: Postify is now available for teams. Schedule across LinkedIn, X, Facebook, Instagram, Threads, Bluesky, Pinterest, and Tumblr from one composer.',
    mediaUrls: [],
    status: 'PARTIAL' as const,
    publishedAt: new Date(Date.now() - 12 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'SUCCESS', externalPostId: 'urn:li:share:7000000000000000004' },
      { socialAccountName: 'Demo Company (X)', status: 'FAILED', errorMessage: 'Rate limit exceeded (demo token)' },
    ],
  },
  {
    text: 'Scheduled demo post: Q3 community update — what shipped and what is next. (Illustrative demo content; this post never fires because its schedule is in the past.)',
    mediaUrls: [],
    status: 'SCHEDULED' as const,
    scheduledAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'PENDING' },
    ],
  },
  {
    text: 'Scheduled demo post: Product tip of the week. (Illustrative demo content; this post never fires because its schedule is in the past.)',
    mediaUrls: ['https://picsum.photos/seed/postify-tip/1200/630'],
    status: 'SCHEDULED' as const,
    scheduledAt: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    targets: [
      { socialAccountName: 'LinkedIn Demo Profile', status: 'PENDING' },
      { socialAccountName: 'Demo Company (X)', status: 'PENDING' },
    ],
  },
]

export async function seedReviewerAccount(): Promise<ReviewerSeedResult> {
  const password = generatePassword()
  const passwordHash = await bcrypt.hash(password, 12)

  // Idempotent: upsert on the reviewer email; never creates duplicates.
  const user = await prisma.user.upsert({
    where: { email: REVIEWER_EMAIL },
    update: {
      name: REVIEWER_NAME,
      role: 'REVIEWER',
      passwordHash,
      emailVerified: new Date(),
      emailVerificationToken: null,
      resetToken: null,
      resetTokenExpiry: null,
    },
    create: {
      email: REVIEWER_EMAIL,
      name: REVIEWER_NAME,
      role: 'REVIEWER',
      passwordHash,
      emailVerified: new Date(),
    },
  })

  // Demo social accounts (clearly marked, fake tokens). Idempotent.
  let demoAccounts = 0
  for (const acc of DEMO_ACCOUNTS) {
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: user.id,
          platform: acc.platform,
          externalId: acc.externalId,
        },
      },
      update: { name: acc.name, handle: acc.handle, tokenExpiry: acc.tokenExpiry, isActive: true },
      create: {
        userId: user.id,
        platform: acc.platform,
        accountType: acc.accountType,
        externalId: acc.externalId,
        name: acc.name,
        handle: acc.handle,
        accessToken: acc.accessToken,
        tokenExpiry: acc.tokenExpiry,
        isActive: true,
      },
    })
    demoAccounts++
  }

  // Demo posts (history + queue + analytics). Idempotent by unique text.
  let demoPosts = 0
  const accountsByName = new Map<string, string>()
  for (const acc of await prisma.socialAccount.findMany({ where: { userId: user.id } })) {
    accountsByName.set(acc.name, acc.id)
  }

  for (const post of DEMO_POSTS) {
    const existing = await prisma.post.findFirst({
      where: { userId: user.id, text: post.text },
    })
    if (existing) continue

    const targetRows = post.targets
      .map((t) => ({ name: t.socialAccountName, ...t }))
      .filter((t) => accountsByName.has(t.name))
      .map((t) => ({
        socialAccountId: accountsByName.get(t.name)!,
        status: t.status,
        externalPostId: t.externalPostId ?? null,
        errorMessage: t.errorMessage ?? null,
        publishedAt: post.status === 'PUBLISHED' || post.status === 'PARTIAL' ? post.publishedAt : null,
      }))

    await prisma.post.create({
      data: {
        userId: user.id,
        text: post.text,
        mediaUrls: post.mediaUrls,
        mediaTypes: post.mediaUrls.map(() => 'image'),
        status: post.status,
        publishedAt: post.publishedAt ?? null,
        scheduledAt: post.scheduledAt ?? null,
        targets: { create: targetRows },
      },
    })
    demoPosts++
  }

  return {
    email: REVIEWER_EMAIL,
    password,
    created: true,
    userId: user.id,
    demoPosts,
    demoAccounts,
  }
}
